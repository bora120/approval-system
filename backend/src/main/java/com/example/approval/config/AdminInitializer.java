package com.example.approval.config;

/**
 * (사용 안 함) 예전 버전에서 서버 시작 때 admin / admin1234! 기본 관리자를 만들던 클래스.
 *
 * 보안상 기본 계정은 더 이상 만들지 않고, 최초 대표는 /setup 에서 초기 설정 토큰으로 등록한다.
 * (organization/service/SetupService 참고)
 *
 * 이 파일을 빈 클래스로 남겨 둔 이유:
 *   압축 파일을 기존 폴더에 "덮어쓰기"하면 예전 AdminInitializer.java 가 지워지지 않고 남는데,
 *   예전 파일은 application.yml 에서 없어진 app.admin.login-id 설정을 찾다가 서버 시작에 실패한다.
 *   같은 이름의 이 파일로 덮어써서 그 문제를 막는다. 이 파일은 지워도 된다.
 */
final class AdminInitializer {

    private AdminInitializer() {}
}
