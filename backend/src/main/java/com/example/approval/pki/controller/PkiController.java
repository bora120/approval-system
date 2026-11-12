package com.example.approval.pki.controller;

import com.example.approval.pki.dto.CertificateIssueRequest;
import com.example.approval.pki.dto.CertificateResponse;
import com.example.approval.pki.dto.ChallengeResponse;
import com.example.approval.pki.dto.MyCertificateResponse;
import com.example.approval.pki.dto.PrivateKeyBackupRequest;
import com.example.approval.pki.dto.PrivateKeyBackupResponse;
import com.example.approval.pki.service.CertificateService;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * 인증서 API (로그인 필요)
 *   GET  /api/pki/me                    내 인증서
 *   POST /api/pki/challenge             발급용 1회용 난수
 *   POST /api/pki/certificates          인증서 발급 (+ 암호화 개인키 보관)
 *   GET  /api/pki/users/{loginId}/certificate  다른 사용자의 공개 인증서 (인증서는 공개 문서)
 *   PUT  /api/pki/me/private-key-backup  내 암호화 개인키 보관·갱신 (본인만)
 *   GET  /api/pki/me/private-key-backup  내 암호화 개인키 내려받기 (본인만, 다른 PC 에서 복원)
 *   GET  /api/pki/certificates/{serial} 인증서 파일(.crt) 내려받기
 *   GET  /api/pki/ca-certificate        루트 CA 인증서 파일 내려받기
 */
@RestController
@RequestMapping("/api/pki")
public class PkiController {

    private final CertificateService certificateService;

    public PkiController(CertificateService certificateService) {
        this.certificateService = certificateService;
    }

    @GetMapping("/me")
    public MyCertificateResponse me(Authentication auth) {
        return certificateService.myCertificate(auth.getName());
    }

    @PostMapping("/challenge")
    public ChallengeResponse challenge(Authentication auth, HttpSession session) {
        return certificateService.newChallenge(auth.getName(), session);
    }

    @PostMapping("/certificates")
    @ResponseStatus(HttpStatus.CREATED)
    public CertificateResponse issue(Authentication auth, HttpSession session,
                                     @RequestBody(required = false) CertificateIssueRequest body) {
        return certificateService.issue(auth.getName(), body, session);
    }

    /** 다른 사용자의 공개 인증서. 로그인한 사내 사용자는 누구나 조회할 수 있다 */
    @GetMapping("/users/{loginId}/certificate")
    public CertificateResponse publicCertificate(@PathVariable String loginId) {
        return certificateService.publicCertificate(loginId);
    }

    /** 내 암호화 개인키 보관·갱신 (평문 개인키·인증서 암호는 받지 않음) */
    @PutMapping("/me/private-key-backup")
    public PrivateKeyBackupResponse savePrivateKeyBackup(Authentication auth,
                                                         @RequestBody(required = false) PrivateKeyBackupRequest body) {
        return certificateService.savePrivateKeyBackup(auth.getName(), body);
    }

    /** 내 암호화 개인키 내려받기 → 브라우저가 인증서 암호로 복호화 */
    @GetMapping("/me/private-key-backup")
    public PrivateKeyBackupResponse privateKeyBackup(Authentication auth) {
        return certificateService.myPrivateKeyBackup(auth.getName());
    }

    @GetMapping("/certificates/{serial}")
    public ResponseEntity<String> download(@PathVariable String serial) {
        return pemFile(certificateService.findBySerial(serial).getCertificatePem(), "user-" + serial + ".crt");
    }

    @GetMapping("/ca-certificate")
    public ResponseEntity<String> caCertificate() {
        return pemFile(certificateService.caCertificatePem(), "e-approval-root-ca.crt");
    }

    /** .crt(PEM) 파일 → 윈도우에서 더블클릭하면 인증서 정보 창으로 열린다 */
    private static ResponseEntity<String> pemFile(String pem, String filename) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/x-x509-ca-cert"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .body(pem);
    }
}
