package com.example.approval.organization.controller;

import com.example.approval.dto.UserResponse;
import com.example.approval.organization.dto.CeoSetupRequest;
import com.example.approval.organization.dto.SetupStatusResponse;
import com.example.approval.organization.service.SetupService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.concurrent.locks.ReentrantLock;

/**
 * 최초 대표 등록 (로그인 없이 접근, SecurityConfig 에서 허용)
 *  GET  /api/setup/status   설정 가능 여부
 *  POST /api/setup/ceo      대표 계정 생성 (초기 설정 토큰 필요)
 */
@RestController
@RequestMapping("/api/setup")
public class SetupController {

    private final SetupService setupService;
    /** 대표가 두 명 만들어지지 않도록, 트랜잭션이 끝날 때까지 한 번에 하나씩만 처리 */
    private final ReentrantLock lock = new ReentrantLock();

    public SetupController(SetupService setupService) {
        this.setupService = setupService;
    }

    @GetMapping("/status")
    public SetupStatusResponse status() {
        return setupService.status();
    }

    @PostMapping("/ceo")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse registerCeo(@Valid @RequestBody CeoSetupRequest req) {
        lock.lock();
        try {
            return setupService.registerCeo(req);
        } finally {
            lock.unlock();
        }
    }
}
