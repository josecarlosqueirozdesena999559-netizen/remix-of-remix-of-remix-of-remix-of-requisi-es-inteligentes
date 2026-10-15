ALTER TABLE public.signature_audit_logs
  DROP CONSTRAINT IF EXISTS signature_audit_logs_event_type_check;

ALTER TABLE public.signature_audit_logs
  ADD CONSTRAINT signature_audit_logs_event_type_check
  CHECK (event_type IN (
    'SIGNATURE_SAVED',
    'SIGNATURE_REMOVED',
    'TOTP_ENABLED',
    'DOCUMENT_OPENED',
    'SIGN_REQUESTED',
    'TOTP_VERIFIED',
    'SIGN_CONFIRMED',
    'PDF_GENERATED',
    'SIGN_COMPLETED',
    'SIGN_FAILED',
    'SIGN_CANCELLED',
    'PREVIEW_REVIEWED',
    'WHATSAPP_OTP_SENT',
    'WHATSAPP_OTP_FAILED',
    'WHATSAPP_OTP_VERIFIED'
  ));
