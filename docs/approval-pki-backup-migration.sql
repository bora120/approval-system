-- Supabase/PostgreSQL migration
-- 애플리케이션이 app 스키마를 사용한다는 현재 저장소 설정 기준.
-- 이미 ddl-auto=update로 컬럼이 생성되었다면 중복 실행해도 안전합니다.

ALTER TABLE IF EXISTS app.user_certificates
    ADD COLUMN IF NOT EXISTS encrypted_private_key VARCHAR(12000),
    ADD COLUMN IF NOT EXISTS private_key_public_key VARCHAR(2000),
    ADD COLUMN IF NOT EXISTS private_key_salt VARCHAR(128),
    ADD COLUMN IF NOT EXISTS private_key_iv VARCHAR(64),
    ADD COLUMN IF NOT EXISTS private_key_iterations INTEGER;
