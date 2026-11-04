package com.example.approval.pki.domain;

public enum CertificateStatus {
    VALID("정상"),
    REVOKED("폐기");

    private final String label;

    CertificateStatus(String label) { this.label = label; }

    public String getLabel() { return label; }
}
