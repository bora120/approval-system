package com.example.approval.messenger.config;

import com.example.approval.messenger.service.MessengerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 보관 기간(app.messenger.file-retention-days, 기본 7일)이 지난 메신저 파일을 자동으로 지운다.
 * 서버 시작 1분 뒤 처음 실행하고, 이후 1시간마다 실행.
 * (필요 없는 민감 파일을 오래 두지 않는 "최소 보관" 원칙)
 */
@Configuration
@EnableScheduling
public class MessengerFileCleanup {

    private static final Logger log = LoggerFactory.getLogger(MessengerFileCleanup.class);

    private final MessengerService messengerService;

    public MessengerFileCleanup(MessengerService messengerService) {
        this.messengerService = messengerService;
    }

    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    public void purgeExpiredFiles() {
        try {
            messengerService.purgeExpiredFiles();
        } catch (RuntimeException e) {
            log.warn("만료 파일 정리 중 오류 (다음 주기에 다시 시도)", e);
        }
    }
}
