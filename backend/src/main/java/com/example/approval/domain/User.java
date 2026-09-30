package com.example.approval.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users") // "user"는 DB 예약어라 users 사용
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String loginId;

    @Column(nullable = false)
    private String password; // BCrypt 해시만 저장

    @Column(nullable = false, length = 30)
    private String name;

    @Column(length = 50)
    private String department;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Position position; // 관리자는 null

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserStatus status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected User() {} // JPA용

    public User(String loginId, String password, String name, String department,
                Position position, Role role, UserStatus status) {
        this.loginId = loginId;
        this.password = password;
        this.name = name;
        this.department = department;
        this.position = position;
        this.role = role;
        this.status = status;
        this.createdAt = LocalDateTime.now();
    }

    public void approve() { this.status = UserStatus.ACTIVE; }
    public void reject() { this.status = UserStatus.REJECTED; }

    public Long getId() { return id; }
    public String getLoginId() { return loginId; }
    public String getPassword() { return password; }
    public String getName() { return name; }
    public String getDepartment() { return department; }
    public Position getPosition() { return position; }
    public Role getRole() { return role; }
    public UserStatus getStatus() { return status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
