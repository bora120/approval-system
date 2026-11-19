package com.example.approval.document.service;

import com.example.approval.document.config.DocumentUploadConfig;
import com.example.approval.exception.ApiException;
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
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * 결재 첨부파일을 저장/조회/삭제한다.
 * 파일 내용은 DB(file_blobs 테이블, Supabase)에 저장한다. 배포 서버 디스크는 재배포 때 지워지기 때문.
 * (예전에 디스크(app.upload.dir)에 저장된 파일은 그대로 읽을 수 있게 남겨 둠)
 *
 * 보안 처리
 *  - 허용된 확장자만 업로드 가능 (실행 파일, 스크립트 등 차단)
 *  - UUID 이름으로 저장 → 원래 파일명으로 경로 조작(../) 불가
 *  - 저장하면서 SHA-256 해시 계산 → 나중에 위변조 여부 확인 가능
 *  - 다운로드는 항상 application/octet-stream 으로 내려보냄 (브라우저에서 HTML/스크립트 실행 방지)
 */
@Service
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    public static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "pdf", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
            "txt", "csv", "jpg", "jpeg", "png", "gif", "zip");

    private final Path root; // 예전 디스크 저장 위치 (읽기 전용 호환)
    private final FileBlobStore blobStore;

    public FileStorageService(@Value("${app.upload.dir:./uploads}") String uploadDir, FileBlobStore blobStore) {
        this.root = Path.of(uploadDir).toAbsolutePath().normalize();
        this.blobStore = blobStore;
    }

    public record StoredFile(String originalName, String storedName, String contentType, long size, String sha256) {}

    public StoredFile store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "빈 파일은 첨부할 수 없습니다.");
        }
        if (file.getSize() > DocumentUploadConfig.MAX_FILE_SIZE_MB * 1024 * 1024) {
            throw new ApiException(HttpStatus.CONTENT_TOO_LARGE,
                    "첨부파일은 파일당 최대 " + DocumentUploadConfig.MAX_FILE_SIZE_MB + "MB까지 올릴 수 있습니다.");
        }

        String originalName = cleanFileName(file.getOriginalFilename());
        String ext = extensionOf(originalName);
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "첨부할 수 없는 파일 형식입니다: " + originalName);
        }

        String storedName = UUID.randomUUID().toString().replace("-", "");
        try {
            byte[] data = file.getBytes();
            String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
            blobStore.save(storedName, FileBlobStore.KIND_ATTACHMENT, data, sha256); // 문서 저장과 같은 트랜잭션
            return new StoredFile(originalName, storedName, file.getContentType(), data.length, sha256);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public Resource load(String storedName) {
        var data = blobStore.load(storedName);
        if (data.isPresent()) return new ByteArrayResource(data.get());
        Path legacy = resolve(storedName); // 예전 버전이 디스크에 저장한 파일
        if (Files.isRegularFile(legacy)) return new FileSystemResource(legacy);
        throw new ApiException(HttpStatus.NOT_FOUND, "파일이 존재하지 않습니다.");
    }

    public void delete(String storedName) {
        try {
            blobStore.delete(storedName);
            Files.deleteIfExists(resolve(storedName));
        } catch (IOException | RuntimeException e) {
            log.warn("첨부파일 삭제 실패: {}", storedName, e);
        }
    }

    /** 저장 경로가 업로드 폴더 밖으로 나가지 않도록 확인 */
    private Path resolve(String storedName) {
        Path path = root.resolve(storedName).normalize();
        if (!path.startsWith(root)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "잘못된 파일 경로입니다.");
        }
        return path;
    }

    /** "C:\\fakepath\\a.pdf", "../../a.pdf" 같은 이름에서 파일명만 남김 */
    static String cleanFileName(String name) {
        if (name == null || name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "파일 이름이 없습니다.");
        }
        String n = name.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1);
        n = n.replaceAll("[\\p{Cntrl}\"<>|:*?]", "_").strip();
        if (n.isEmpty() || n.equals(".") || n.equals("..")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "파일 이름이 올바르지 않습니다.");
        }
        return n.length() > 200 ? n.substring(n.length() - 200) : n;
    }

    static String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
