package com.example.approval.document.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import java.util.Map;

/** 파일 업로드 관련 에러를 {"message": "..."} 형태로 변환 (결재 문서·메신저 공통) */
@RestControllerAdvice
public class DocumentExceptionHandler {

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleTooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                .body(Map.of("message", "파일 용량이 너무 큽니다. (결재 첨부: 파일당 "
                        + DocumentUploadConfig.MAX_FILE_SIZE_MB + "MB, 메신저 파일 전송: 20MB)"));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<Map<String, String>> handleMissingPart(MissingServletRequestPartException e) {
        return ResponseEntity.badRequest().body(Map.of("message", "요청 형식이 올바르지 않습니다."));
    }
}
