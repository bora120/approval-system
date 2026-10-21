package com.example.approval.messenger.service;

import com.example.approval.exception.ApiException;
import com.example.approval.messenger.MessengerLimits;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 메신저 첨부파일 저장소.
 * 파일은 브라우저에서 이미 AES-256-GCM 으로 암호화되어 올라오므로 서버는 내용을 알 수 없다.
 * 원래 파일 이름·형식도 암호문 안에 있어 서버에는 랜덤 이름의 암호문 덩어리만 남는다.
 */
@Service
public class EncryptedFileStorage {

    private static final Logger log = LoggerFactory.getLogger(EncryptedFileStorage.class);
    private static final Pattern STORED_NAME = Pattern.compile("^[a-f0-9]{32}$");

    private final Path root;

    public EncryptedFileStorage(@Value("${app.upload.dir:./uploads}") String uploadDir) {
        this.root = Path.of(uploadDir, "messenger").toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("메신저 업로드 폴더를 만들 수 없습니다: " + root, e);
        }
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
        Path target = resolve(storedName);

        try (InputStream in = file.getInputStream();
             DigestInputStream digestIn = new DigestInputStream(in, MessageDigest.getInstance("SHA-256"))) {
            long size = Files.copy(digestIn, target);
            String sha256 = HexFormat.of().formatHex(digestIn.getMessageDigest().digest());
            return new StoredBlob(storedName, size, sha256);
        } catch (IOException e) {
            delete(storedName);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public Resource load(String storedName) {
        Path path = resolve(storedName);
        if (!Files.isRegularFile(path)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "파일이 존재하지 않습니다.");
        }
        return new FileSystemResource(path);
    }

    public void delete(String storedName) {
        try {
            Files.deleteIfExists(resolve(storedName));
        } catch (IOException | ApiException e) {
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
