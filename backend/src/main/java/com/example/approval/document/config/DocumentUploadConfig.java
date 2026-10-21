package com.example.approval.document.config;

import jakarta.servlet.MultipartConfigElement;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 파일 업로드 용량 설정 (서버 전체 공통 상한).
 * 스프링 기본값은 파일당 1MB라서 결재 첨부파일·메신저 파일 전송용으로 늘린다.
 * 기능별 실제 제한은 각 서비스에서 따로 검사한다.
 *   - 결재 문서 첨부: 파일당 10MB, 최대 5개 (MAX_FILE_SIZE_MB / MAX_FILE_COUNT)
 *   - 메신저 파일 전송: 20MB (MessengerLimits.MAX_FILE_BYTES)
 * (이 Bean이 있으면 application.yml 의 spring.servlet.multipart.* 설정은 무시됨)
 */
@Configuration
public class DocumentUploadConfig {

    public static final long MAX_FILE_SIZE_MB = 10;
    public static final int MAX_FILE_COUNT = 5;

    /** 서버가 받아들이는 파일 1개의 최대 크기 (모든 기능 중 가장 큰 값 + 여유) */
    public static final long SERVER_MAX_FILE_SIZE_MB = 21;

    @Bean
    public MultipartConfigElement multipartConfigElement() {
        long mb = 1024L * 1024L;
        long maxFileSize = SERVER_MAX_FILE_SIZE_MB * mb;
        long maxRequestSize = (MAX_FILE_SIZE_MB * MAX_FILE_COUNT + 1) * mb; // 결재 첨부 5개(50MB) + JSON
        return new MultipartConfigElement("", maxFileSize, maxRequestSize, 0);
    }
}
