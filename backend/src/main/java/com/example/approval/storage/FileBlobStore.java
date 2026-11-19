package com.example.approval.storage;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * 파일 내용을 DB(file_blobs)에 저장/조회/삭제한다.
 *
 * 저장은 호출한 쪽의 트랜잭션에 함께 묶인다 → 문서·메시지 저장이 실패(롤백)하면 파일도 같이 취소된다.
 * 삭제는 "DB 변경이 커밋된 뒤" 콜백에서 불리므로 항상 새 트랜잭션(REQUIRES_NEW)으로 실행한다.
 */
@Service
public class FileBlobStore {

    public static final String KIND_ATTACHMENT = "ATTACHMENT";
    public static final String KIND_MESSENGER = "MESSENGER";

    private final FileBlobRepository repository;

    public FileBlobStore(FileBlobRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void save(String storedName, String kind, byte[] data, String sha256) {
        repository.save(new FileBlob(storedName, kind, data, sha256));
    }

    @Transactional(readOnly = true)
    public Optional<byte[]> load(String storedName) {
        return repository.findById(storedName).map(FileBlob::getData);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void delete(String storedName) {
        repository.deleteByStoredName(storedName);
    }
}
