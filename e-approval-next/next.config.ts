import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";

// 백엔드(Spring Boot) 주소. 다른 주소를 쓰려면 실행 전에 BACKEND_URL 환경변수를 지정하세요.
// localhost 대신 127.0.0.1 을 쓰는 이유: Windows/Node 에서 localhost 가 IPv6(::1)로 먼저 연결돼 실패하는 경우가 있음
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

// 이 컴퓨터의 IPv4 주소들 (예: 192.168.0.12)
// Next 16 개발 서버는 localhost 가 아닌 주소(127.0.0.1, "Network:" 주소)로 접속하면
// 화면 스크립트 연결을 차단해서 버튼이 동작하지 않는다 → 내 컴퓨터 주소들은 허용
const localIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((n): n is os.NetworkInterfaceInfo => !!n && n.family === "IPv4")
  .map((n) => n.address);

const nextConfig: NextConfig = {
  // 실행할 때마다 프로젝트에 AGENTS.md 파일을 만들지 않도록 끔
  agentRules: false,

  allowedDevOrigins: ["127.0.0.1", ...localIps],

  experimental: {
    // /api 를 백엔드로 넘길 때 Next 가 허용하는 요청 크기. 기본값 10MB 라서
    // 그보다 큰 파일(메신저 20MB, 결재 첨부 5개 최대 50MB)이 잘려 전송이 실패했음 → 백엔드 한도에 맞춤
    proxyClientMaxBodySize: "60mb",
    // 큰 파일을 느린 네트워크로 올릴 때 중간에 끊기지 않도록 프록시 대기 시간을 2분으로
    proxyTimeout: 120_000,
  },

  // 상위 폴더에 다른 package-lock.json 이 있어도 이 폴더를 프로젝트 루트로 사용
  turbopack: { root: path.resolve(__dirname) },

  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
