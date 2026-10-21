package com.example.approval.messenger.controller;

import com.example.approval.messenger.dto.*;
import com.example.approval.messenger.service.MessengerService;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 종단간 암호화 메신저 API (로그인 필요)
 *
 *  GET  /api/messenger/keys/me                          내 현재 공개키 (없으면 204)
 *  POST /api/messenger/keys                             새 공개키 등록
 *  GET  /api/messenger/contacts?keyword=                대화 상대 목록
 *  GET  /api/messenger/contacts/{userId}/key            상대 현재 공개키
 *  GET  /api/messenger/conversations                    대화 목록
 *  GET  /api/messenger/conversations/{partnerId}/messages?afterId=&beforeId=&limit=
 *  POST /api/messenger/conversations/{partnerId}/read   읽음 처리
 *  GET  /api/messenger/unread-count                     안 읽은 메시지 수
 *  POST /api/messenger/messages                         전송 (multipart: data=JSON, file=암호화된 파일)
 *  GET  /api/messenger/messages/{id}/file               암호화된 첨부파일 다운로드 (받는 사람이면 수신 확인 기록)
 *  DELETE /api/messenger/messages/{id}/file             첨부파일 삭제 (보낸 사람: 전송 취소)
 *  GET  /api/messenger/files?box=received|sent&beforeId=&limit=   파일함
 */
@RestController
@RequestMapping("/api/messenger")
public class MessengerController {

    private final MessengerService messengerService;

    public MessengerController(MessengerService messengerService) {
        this.messengerService = messengerService;
    }

    @GetMapping("/keys/me")
    public ResponseEntity<KeyResponse> myKey(Authentication auth) {
        return messengerService.myKey(auth.getName())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/keys")
    @ResponseStatus(HttpStatus.CREATED)
    public KeyResponse registerKey(Authentication auth, @RequestBody KeyRegisterRequest req) {
        return messengerService.registerKey(auth.getName(), req);
    }

    @GetMapping("/contacts")
    public List<ContactResponse> contacts(Authentication auth, @RequestParam(required = false) String keyword) {
        return messengerService.contacts(auth.getName(), keyword);
    }

    @GetMapping("/contacts/{userId}/key")
    public KeyResponse contactKey(Authentication auth, @PathVariable Long userId) {
        return messengerService.contactKey(auth.getName(), userId);
    }

    @GetMapping("/conversations")
    public List<ConversationResponse> conversations(Authentication auth) {
        return messengerService.conversations(auth.getName());
    }

    @GetMapping("/conversations/{partnerId}/messages")
    public MessagePageResponse messages(Authentication auth,
                                        @PathVariable Long partnerId,
                                        @RequestParam(required = false) Long afterId,
                                        @RequestParam(required = false) Long beforeId,
                                        @RequestParam(required = false) Integer limit) {
        return messengerService.messages(auth.getName(), partnerId, afterId, beforeId, limit);
    }

    @PostMapping("/conversations/{partnerId}/read")
    public Map<String, Integer> markRead(Authentication auth, @PathVariable Long partnerId) {
        return Map.of("updated", messengerService.markRead(auth.getName(), partnerId));
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(Authentication auth) {
        return Map.of("count", messengerService.unreadCount(auth.getName()));
    }

    @PostMapping(path = "/messages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public MessageResponse send(Authentication auth,
                                @RequestPart("data") MessageSendRequest data,
                                @RequestPart(name = "file", required = false) MultipartFile file) {
        return messengerService.send(auth.getName(), data, file);
    }

    /** 첨부파일은 암호문 그대로 내려준다. 복호화는 받는 사람 브라우저에서만 가능 */
    @GetMapping("/messages/{id}/file")
    public ResponseEntity<Resource> file(Authentication auth, @PathVariable Long id) {
        MessengerService.EncryptedFile file = messengerService.loadFile(auth.getName(), id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(file.size())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("encrypted-" + id + ".bin").build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(file.resource());
    }

    @DeleteMapping("/messages/{id}/file")
    public MessageResponse deleteFile(Authentication auth, @PathVariable Long id) {
        return messengerService.deleteFile(auth.getName(), id);
    }

    @GetMapping("/files")
    public FilePageResponse files(Authentication auth,
                                  @RequestParam(defaultValue = "received") String box,
                                  @RequestParam(required = false) Long beforeId,
                                  @RequestParam(required = false) Integer limit) {
        return messengerService.files(auth.getName(), box, beforeId, limit);
    }
}
