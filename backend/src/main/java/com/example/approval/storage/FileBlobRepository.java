package com.example.approval.storage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FileBlobRepository extends JpaRepository<FileBlob, String> {

    /** 없는 파일이어도 오류 없이 0 을 돌려준다 */
    @Modifying
    @Query("delete from FileBlob b where b.storedName = :storedName")
    int deleteByStoredName(@Param("storedName") String storedName);
}
