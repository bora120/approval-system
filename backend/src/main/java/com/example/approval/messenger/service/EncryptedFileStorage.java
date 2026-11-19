package com.example.approval.messenger.service;

import com.example.approval.exception.ApiException;
import com.example.approval.messenger.MessengerLimits;
import com.example.approval.storage.FileBlobStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 메신저 첨부파일 저장소.
 * 파일은 브라우저에서 이미 AES-256-GCM 으로 암호화되어 올라오므로 서버는 내용을 알 수 없다.
 * 원래 파일 이름·형식도 암호문 안에 있어 서버에는 랜덤 이름의 암호문 덩어리만 남는다.
 * 암호문은 DB(file_blobs 테이블, Supabase)에 저장한다. (예전 디스크 저장분은 읽기만 호환)
 */
@Service
public class EncryptedFileStorage {

    private static final Logger log = LoggerFactory.getLogger(EncryptedFileStorage.class);
    private static final Pattern STORED_NAME = Pattern.compile("^[a-f0-9]{32}$");

    private final Path root; // 예전 디스크 저장 위치 (읽기 전용 호환)
    private final FileBlobStore blobStore;

    public EncryptedFileStorage(@Value("${app.upload.dir:./uploads}") String uploadDir, FileBlobStore blobStore) {
        this.root = Path.of(uploadDir, "messenger").toAbsolutePath().normalize();
        this.blobStore = blobStore;
    }

    public record StoredBlob(String storedName, long size, String sha256) {}

    public StoredBlob store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "빈 파일은 보낼 수 없습니다.");
        }
        if (file.getSize() > MessengerLimits.MAX_FILE_BYTES) {
            throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "파일은 최대 20MB까지 보낼 수 있습니다.");
        }

        String storedName = UUID.randomUUID().toString().replace("-", "");
        try {
            byte[] data = file.getBytes();
            String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
            blobStore.save(storedName, FileBlobStore.KIND_MESSENGER, data, sha256); // 메시지 저장과 같은 트랜잭션
            return new StoredBlob(storedName, data.length, sha256);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public Resource load(String storedName) {
        Path legacy = resolve(storedName); // 이름 형식 검사도 함께 함
        var data = blobStore.load(storedName);
        if (data.isPresent()) return new ByteArrayResource(data.get());
        if (Files.isRegularFile(legacy)) return new FileSystemResource(legacy);
        throw new ApiException(HttpStatus.NOT_FOUND, "파일이 존재하지 않습니다.");
    }

    public void delete(String storedName) {
        try {
            Path legacy = resolve(storedName);
            blobStore.delete(storedName);
            Files.deleteIfExists(legacy);
        } catch (IOException | RuntimeException e) {
            log.warn("메신저 첨부파일 삭제 실패: {}", storedName, e);
        }
    }

    private Path resolve(String storedName) {
        if (storedName == null || !STORED_NAME.matcher(storedName).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "잘못된 파일 이름입니다.");
        }
        Path path = root.resolve(storedName).normalize();
        if (!path.startsWith(root)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "잘못된 파일 경로입니다.");
        }
        return path;
    }
}
