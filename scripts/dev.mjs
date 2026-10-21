#!/usr/bin/env node
/**
 * 전자결재 시스템 개발 서버 실행기
 *
 *   npm run dev          백엔드 + 프론트엔드 함께 실행 (기본)
 *   npm run dev:back     백엔드만
 *   npm run dev:front    프론트엔드만 (백엔드는 따로 켜둔 경우)
 *   npm run setup        필요한 프로그램 확인 + 프론트 패키지 설치만
 *
 * 하는 일
 *  1. Node / Java 버전 확인 (없으면 설치 방법 안내)
 *  2. 프론트 패키지(node_modules)가 없으면 자동 설치
 *  3. 백엔드 실행 → 실제로 응답할 때까지 기다림 → 프론트 실행
 *     (백엔드가 덜 켜진 상태에서 로그인해서 실패하는 일을 막음)
 *  4. 이미 켜진 백엔드가 있으면 재사용, 3000 포트가 사용 중이면 빈 포트 사용
 *  5. Ctrl+C 한 번으로 둘 다 종료
 *
 * 외부 패키지 없이 Node 기본 기능만 사용한다.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, chmodSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------- 설정
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const FRONT_DIR = path.join(ROOT, "e-approval-next");
const BACKEND_PORT = 8080;
const FRONT_PORT = Number(process.env.PORT) || 3000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const BACKEND_TIMEOUT_MS = 5 * 60 * 1000; // 첫 실행은 Gradle 다운로드 때문에 오래 걸릴 수 있음
const MIN_NODE = [20, 9];
const MIN_JAVA = 17;

const IS_WIN = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const MODE = args.has("--back-only") ? "back"
  : args.has("--front-only") ? "front"
  : args.has("--setup-only") ? "setup"
  : args.has("--check-backend") ? "check"
  : "all";

// ---------------------------------------------------------------- 출력
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { red: (s) => paint(31, s), green: (s) => paint(32, s), yellow: (s) => paint(33, s), cyan: (s) => paint(36, s), magenta: (s) => paint(35, s), bold: (s) => paint(1, s), dim: (s) => paint(2, s) };

const info = (msg) => console.log(`${c.cyan("[실행기]")} ${msg}`);
const warn = (msg) => console.log(`${c.yellow("[실행기]")} ${c.yellow(msg)}`);
/** 실행을 멈출 때 쓰는 표시용 에러 (메시지는 이미 출력했으므로 다시 출력하지 않음) */
class Halt extends Error {}

function report(msg, hint) {
  if (shuttingDown) return;
  console.error(`\n${c.red("[실행기] 오류:")} ${msg}`);
  if (hint) console.error(c.yellow(hint));
  console.error("");
  shutdown(1);
}

/** 오류를 알리고 실행을 즉시 멈춘다 */
function fail(msg, hint) {
  report(msg, hint);
  throw new Halt(msg);
}

// ---------------------------------------------------------------- 유틸
function parseVersion(text) {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(800);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

async function findFreePort(start) {
  for (let p = start; p < start + 20; p++) {
    if (!(await isPortOpen(p))) return p;
  }
  return null;
}

/** 8080 에 떠 있는 게 우리 백엔드인지 확인 (로그인 안 한 /me 요청 → 401) */
async function isOurBackend() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, { signal: AbortSignal.timeout(2000) });
    return res.status === 401 || res.status === 200;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 자식 프로세스 관리
const children = [];
let shuttingDown = false;

function run(label, color, command, cwd, extraEnv = {}) {
  const child = spawn(command, {
    cwd,
    shell: true, // Windows 의 npm.cmd / gradlew.bat 실행에 필요
    env: { ...process.env, FORCE_COLOR: "1", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    detached: !IS_WIN, // Mac/Linux: 프로세스 그룹째 종료하기 위해
  });
  const prefix = color(`[${label}]`);
  const pipe = (stream, out) => {
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(`${prefix} ${line}\n`);
    });
    stream.on("end", () => buf && out.write(`${prefix} ${buf}\n`));
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  children.push(child);
  return child;
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // 이미 종료됨
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (children.length) info("종료하는 중...");
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

// ---------------------------------------------------------------- 1. 환경 점검
function checkFolders() {
  if (!existsSync(path.join(BACKEND_DIR, "build.gradle"))) {
    fail(`backend 폴더를 찾을 수 없습니다: ${BACKEND_DIR}`, "프로젝트 최상위 폴더(backend, e-approval-next 가 보이는 곳)에서 실행하세요.");
  }
  if (!existsSync(path.join(FRONT_DIR, "package.json"))) {
    fail(`e-approval-next 폴더를 찾을 수 없습니다: ${FRONT_DIR}`, "프로젝트 최상위 폴더(backend, e-approval-next 가 보이는 곳)에서 실행하세요.");
  }
}

function checkNode() {
  const v = parseVersion(process.versions.node);
  if (!v || v[0] < MIN_NODE[0] || (v[0] === MIN_NODE[0] && v[1] < MIN_NODE[1])) {
    fail(`Node.js ${MIN_NODE.join(".")} 이상이 필요합니다. (현재 ${process.versions.node})`,
      "설치: 관리자 권한 명령 프롬프트에서  winget install OpenJS.NodeJS.LTS  → VS Code 재시작");
  }
}

function checkJava() {
  const r = spawnSync("java -version", { encoding: "utf8", shell: true });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = /version "([^"]+)"/.exec(out);
  if (r.error || r.status !== 0 || !m) {
    fail("Java(JDK)를 찾을 수 없습니다. 백엔드를 실행하려면 JDK 17 이상이 필요합니다.",
      "설치: 관리자 권한 명령 프롬프트에서  winget install EclipseAdoptium.Temurin.21.JDK  → VS Code 재시작");
  }
  const parts = m[1].split(/[.+-]/).map(Number);
  const major = parts[0] === 1 ? parts[1] : parts[0]; // "1.8.0" 형식 대응
  if (major < MIN_JAVA) {
    fail(`JDK ${MIN_JAVA} 이상이 필요합니다. (현재 ${m[1]})`,
      "설치: winget install EclipseAdoptium.Temurin.21.JDK  → 시스템 환경 변수의 JAVA_HOME 을 새 JDK 로 변경 → VS Code 재시작");
  }
  info(`Java ${m[1]} 확인`);
}

// ---------------------------------------------------------------- 2. 프론트 패키지 설치
function ensureFrontDeps() {
  const nextPkg = path.join(FRONT_DIR, "node_modules", "next", "package.json");
  if (existsSync(nextPkg)) return;
  info("프론트엔드 패키지를 설치합니다. (처음 한 번만, 1~2분 걸릴 수 있어요)");
  const r = spawnSync("npm install --no-audit --no-fund", { cwd: FRONT_DIR, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    fail("npm install 에 실패했습니다.", "인터넷 연결을 확인하고, e-approval-next 폴더의 node_modules 를 지운 뒤 다시 실행해 보세요.");
  }
}

// ---------------------------------------------------------------- 3. 백엔드
async function startBackend() {
  if (await isPortOpen(BACKEND_PORT)) {
    if (await isOurBackend()) {
      info(`이미 실행 중인 백엔드를 사용합니다. (${BACKEND_URL})`);
      return;
    }
    fail(`${BACKEND_PORT} 포트를 다른 프로그램이 사용 중입니다.`,
      `PowerShell 에서  Get-NetTCPConnection -LocalPort ${BACKEND_PORT}  으로 프로그램을 확인해 종료하세요.`);
  }

  const wrapper = path.join(BACKEND_DIR, IS_WIN ? "gradlew.bat" : "gradlew");
  if (!existsSync(wrapper)) fail(`Gradle 실행 파일이 없습니다: ${wrapper}`);
  if (!IS_WIN) {
    try { chmodSync(wrapper, 0o755); } catch { /* 권한 변경 실패는 무시 */ }
  }

  info("백엔드를 시작합니다. (첫 실행은 Gradle·라이브러리 다운로드로 몇 분 걸려요)");
  const backend = run("백엔드", c.magenta, IS_WIN ? "gradlew.bat bootRun" : "./gradlew bootRun", BACKEND_DIR);
  backend.on("exit", (code) => {
    if (!shuttingDown) report(`백엔드가 종료되었습니다. (코드 ${code})`, "위쪽 [백엔드] 로그의 ERROR / Caused by 부분을 확인하세요.");
  });

  // 실제로 API 가 응답할 때까지 대기
  const started = Date.now();
  let lastNotice = 0;
  while (Date.now() - started < BACKEND_TIMEOUT_MS) {
    if (shuttingDown) throw new Halt("stopped");
    if (await isOurBackend()) {
      info(c.green(`백엔드 준비 완료 (${Math.round((Date.now() - started) / 1000)}초)`));
      return;
    }
    if (Date.now() - lastNotice > 30_000 && Date.now() - started > 10_000) {
      info(c.dim("백엔드가 켜지기를 기다리는 중..."));
      lastNotice = Date.now();
    }
    await sleep(1000);
  }
  fail("백엔드가 5분 안에 시작되지 않았습니다.", "[백엔드] 로그에서 오류를 확인하세요.");
}

// ---------------------------------------------------------------- 4. 프론트엔드
async function startFront() {
  const port = await findFreePort(FRONT_PORT);
  if (!port) fail(`${FRONT_PORT}~${FRONT_PORT + 19} 포트가 모두 사용 중입니다.`);
  if (port !== FRONT_PORT) warn(`${FRONT_PORT} 포트가 사용 중이라 ${port} 포트를 사용합니다.`);

  const front = run("프론트", c.green, `npm run dev -- -p ${port}`, FRONT_DIR, { BACKEND_URL });
  front.on("exit", (code) => {
    if (!shuttingDown) report(`프론트엔드가 종료되었습니다. (코드 ${code})`, "위쪽 [프론트] 로그를 확인하세요.");
  });

  // 프론트가 뜨면 접속 주소 안내
  for (let i = 0; i < 120; i++) {
    if (shuttingDown) throw new Halt("stopped");
    if (await isPortOpen(port)) {
      console.log(`\n${c.bold(c.green("  ✔ 준비 완료!"))}  브라우저에서 ${c.bold(c.cyan(`http://localhost:${port}`))} 을 여세요.`);
      console.log(c.dim("    종료하려면 이 터미널에서 Ctrl + C\n"));
      return;
    }
    await sleep(500);
  }
}

// ---------------------------------------------------------------- 실행
async function main() {
  if (MODE !== "check") console.log(c.bold("\n전자결재 시스템 실행기\n"));
  if (MODE === "check") {
    // e-approval-next 폴더에서 npm run dev 를 직접 실행할 때: 백엔드가 꺼져 있으면 경고만 한다
    if (!(await isOurBackend())) {
      warn(`백엔드(${BACKEND_URL})가 꺼져 있어 로그인/회원가입이 되지 않습니다.`);
      warn("프로젝트 최상위 폴더에서  npm run dev  를 실행하면 백엔드와 화면이 함께 켜집니다.");
    }
    return;
  }
  checkFolders();
  checkNode();

  if (MODE === "setup") {
    checkJava();
    ensureFrontDeps();
    info(c.green("준비가 끝났습니다. 이제  npm run dev  로 실행하세요."));
    return;
  }
  if (MODE !== "front") checkJava();
  if (MODE !== "back") ensureFrontDeps();

  if (MODE !== "front") await startBackend();
  else if (!(await isOurBackend())) warn(`백엔드(${BACKEND_URL})가 꺼져 있습니다. 로그인하려면 백엔드도 켜야 해요.`);

  if (MODE !== "back") await startFront();
  else info(c.green(`백엔드 실행 중: ${BACKEND_URL}  (종료: Ctrl + C)`));

  if (MODE !== "front") await announceSetup();
}

/** 대표 계정이 아직 없으면 최초 설정 방법을 눈에 띄게 안내 */
async function announceSetup() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/setup/status`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const { available, tokenFromEnv } = await res.json();
    if (!available) return;
    console.log(c.yellow(c.bold("  ★ 아직 대표 계정이 없습니다.")));
    console.log(c.yellow(`    http://localhost:${FRONT_PORT}/setup 에서 대표 계정을 만드세요.`));
    console.log(
      c.yellow(
        tokenFromEnv
          ? "    토큰: 환경변수 CEO_SETUP_TOKEN 에 설정한 값"
          : "    토큰: 위쪽 [백엔드] 로그의 '아직 대표 계정이 없습니다' 박스에 출력된 값\n",
      ),
    );
  } catch {
    // 안내 실패는 무시
  }
}

main().catch((e) => {
  if (!(e instanceof Halt)) report(e?.message ?? String(e));
});
