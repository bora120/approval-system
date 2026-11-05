package com.example.approval.config;

import com.example.approval.document.domain.DocumentIntegrity;
import com.example.approval.domain.Position;
import com.example.approval.domain.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * 기존 DB 호환 처리.
 *
 * Hibernate 는 enum 컬럼을 만들 때 허용 값 목록을 DB 에 같이 새겨 둔다.
 *   - H2    : CHECK (ROLE IN ('USER','ADMIN'))
 *   - MySQL : ENUM('USER','ADMIN') 컬럼 타입
 *   - PostgreSQL(Supabase) : CHECK ((role)::text = ANY (ARRAY['USER'::character varying, ...]))
 * 그런데 ddl-auto=update 는 이미 있는 컬럼을 고치지 않기 때문에, 나중에 enum 값을 추가하면
 * (예: Role.SUPER_ADMIN, Position.VICE_CEO) 예전 DB 에서는 저장할 때 오류가 난다.
 *
 * 서버 시작 시 아래 목록의 컬럼을 확인해, 새 값이 빠진 제약만 풀어 준다. (값 검증은 자바 enum 이 함)
 * 앞으로 enum 에 값을 추가하면 COLUMNS 목록에만 등록하면 된다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class EnumColumnCompatibility implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(EnumColumnCompatibility.class);

    private record EnumColumn(String table, String column, Enum<?>[] values, boolean nullable) {}

    private static final List<EnumColumn> COLUMNS = List.of(
            new EnumColumn("users", "role", Role.values(), false),
            new EnumColumn("users", "position", Position.values(), true),
            new EnumColumn("approval_documents", "integrity", DocumentIntegrity.values(), true)
    );

    private final DataSource dataSource;

    public EnumColumnCompatibility(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            String product = conn.getMetaData().getDatabaseProductName().toLowerCase(Locale.ROOT);
            for (EnumColumn col : COLUMNS) {
                if (product.contains("h2")) fixH2(conn, col);
                else if (product.contains("mysql") || product.contains("mariadb")) fixMySql(conn, col);
                else if (product.contains("postgresql")) fixPostgres(conn, col);
            }
        } catch (SQLException | RuntimeException e) {
            // 호환 처리 실패가 서버 시작을 막지 않도록 경고만 남김
            log.warn("enum 컬럼 호환 처리 중 오류가 발생했습니다. (새 직책·권한 저장이 실패하면 users 테이블의 CHECK 제약을 확인하세요)", e);
        }
    }

    /** H2: 새 값이 빠진 CHECK 제약을 삭제 */
    private void fixH2(Connection conn, EnumColumn col) throws SQLException {
        String sql = """
                SELECT tc.CONSTRAINT_SCHEMA, tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
                  ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
                WHERE tc.TABLE_NAME = ? AND tc.CONSTRAINT_TYPE = 'CHECK'
                """;
        List<String[]> toDrop = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, col.table().toUpperCase(Locale.ROOT));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String clause = rs.getString("CHECK_CLAUSE");
                    if (clause == null) continue;
                    String upper = clause.toUpperCase(Locale.ROOT);
                    boolean aboutColumn = upper.contains("\"" + col.column().toUpperCase(Locale.ROOT) + "\"")
                            || upper.matches("(?s).*\\b" + col.column().toUpperCase(Locale.ROOT) + "\\b.*");
                    boolean isValueList = upper.contains(" IN");
                    boolean missingValue = Arrays.stream(col.values()).anyMatch(v -> !clause.contains("'" + v.name() + "'"));
                    if (aboutColumn && isValueList && missingValue) {
                        toDrop.add(new String[]{rs.getString("CONSTRAINT_SCHEMA"), rs.getString("CONSTRAINT_NAME")});
                    }
                }
            }
        }
        for (String[] c : toDrop) {
            try (Statement st = conn.createStatement()) {
                st.execute("ALTER TABLE \"" + c[0] + "\".\"" + col.table().toUpperCase(Locale.ROOT)
                        + "\" DROP CONSTRAINT \"" + c[1] + "\"");
                log.info("기존 DB 호환: {}.{} 컬럼의 예전 허용값 제약({})을 해제했습니다.", col.table(), col.column(), c[1]);
            }
        }
    }

    /** MySQL: ENUM(...) 컬럼에 새 값이 빠져 있으면 VARCHAR 로 변경 */
    private void fixMySql(Connection conn, EnumColumn col) throws SQLException {
        String sql = "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS"
                + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?";
        String columnType = null;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, col.table());
            ps.setString(2, col.column());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) columnType = rs.getString(1);
            }
        }
        if (columnType == null || !columnType.toLowerCase(Locale.ROOT).startsWith("enum(")) return;
        String type = columnType;
        boolean missingValue = Arrays.stream(col.values()).anyMatch(v -> !type.contains("'" + v.name() + "'"));
        if (!missingValue) return;
        try (Statement st = conn.createStatement()) {
            st.execute("ALTER TABLE `" + col.table() + "` MODIFY COLUMN `" + col.column() + "` VARCHAR(30) "
                    + (col.nullable() ? "NULL" : "NOT NULL"));
            log.info("기존 DB 호환: {}.{} 컬럼을 VARCHAR 로 변경했습니다.", col.table(), col.column());
        }
    }

    /** PostgreSQL(Supabase): 새 값이 빠진 CHECK 제약을 삭제. 현재 스키마(app)의 테이블만 본다 (auth.users 등은 건드리지 않음) */
    private void fixPostgres(Connection conn, EnumColumn col) throws SQLException {
        String sql = """
                SELECT n.nspname, c.conname, pg_get_constraintdef(c.oid)
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE c.contype = 'c' AND t.relname = ? AND n.nspname = current_schema()
                """;
        List<String[]> toDrop = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, col.table());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String def = rs.getString(3);
                    if (def == null) continue;
                    boolean aboutColumn = def.matches("(?s).*\\b" + col.column() + "\\b.*");
                    String upper = def.toUpperCase(Locale.ROOT);
                    boolean isValueList = upper.contains(" ANY ") || upper.contains(" IN ");
                    boolean missingValue = Arrays.stream(col.values()).anyMatch(v -> !def.contains("'" + v.name() + "'"));
                    if (aboutColumn && isValueList && missingValue) {
                        toDrop.add(new String[]{rs.getString(1), rs.getString(2)});
                    }
                }
            }
        }
        for (String[] c : toDrop) {
            try (Statement st = conn.createStatement()) {
                st.execute("ALTER TABLE \"" + c[0] + "\".\"" + col.table() + "\" DROP CONSTRAINT \"" + c[1] + "\"");
                log.info("기존 DB 호환: {}.{} 컬럼의 예전 허용값 제약({})을 해제했습니다.", col.table(), col.column(), c[1]);
            }
        }
    }
}
