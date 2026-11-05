# 백엔드(Spring Boot) 배포용 이미지 — Render 등 Docker 를 지원하는 호스팅에서 사용
# 1단계: 소스를 빌드해서 실행용 jar 만들기
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# 의존성 다운로드를 먼저 해 두면, 소스만 바뀌었을 때 다시 받지 않아 빌드가 빨라진다
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null

COPY src ./src
RUN ./gradlew --no-daemon bootJar && cp build/libs/*.jar /app/app.jar

# 2단계: 실행에 필요한 JRE + jar 만 담은 가벼운 이미지
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/app.jar app.jar

# 서버 시계를 한국 시간으로 (배포 서버 기본값은 UTC → 결재 시각·인증서 유효기간 비교가 9시간 어긋남)
ENV TZ=Asia/Seoul
# 무료 인스턴스(메모리 512MB)에서 메모리 초과로 죽지 않도록 힙을 컨테이너 메모리의 60%로 제한
ENV JAVA_OPTS="-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"
# 포트는 호스팅이 PORT 환경변수로 알려준다 (application.yml 의 server.port: ${PORT:8080})
EXPOSE 8080
# user.timezone 은 JAVA_OPTS 를 덮어써도 항상 적용되도록 따로 지정
CMD ["sh", "-c", "exec java -Duser.timezone=Asia/Seoul $JAVA_OPTS -jar app.jar"]
