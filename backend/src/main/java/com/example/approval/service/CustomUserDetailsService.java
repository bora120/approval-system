package com.example.approval.service;

import com.example.approval.domain.User;
import com.example.approval.repository.UserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Spring Security가 로그인 시 사용자 정보를 가져오는 곳.
 * 권한: ROLE_USER / ROLE_ADMIN + 직책(POSITION_TEAM_LEADER 등)
 *
 * 참고: 승인 대기(PENDING) 체크를 여기서 하지 않고 AuthController에서
 * "비밀번호가 맞은 뒤에" 한다. 여기서 막으면 비밀번호가 틀려도
 * "승인 대기 중"이 떠서 아이디 존재 여부가 노출되기 때문.
 */
@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String loginId) throws UsernameNotFoundException {
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new UsernameNotFoundException("not found"));

        List<SimpleGrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
        if (user.getPosition() != null) {
            authorities.add(new SimpleGrantedAuthority("POSITION_" + user.getPosition().name()));
        }

        return org.springframework.security.core.userdetails.User
                .withUsername(user.getLoginId())
                .password(user.getPassword())
                .authorities(authorities)
                .build();
    }
}
