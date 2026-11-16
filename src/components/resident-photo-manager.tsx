"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  photoUrl?: string;
  residentName?: string;
  onPhotoChange: (newUrl: string) => void;
  disabled?: boolean;
};

export default function ResidentPhotoManager({
  photoUrl,
  residentName = "",
  onPhotoChange,
  disabled = false,
}: Props) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // تشغيل الكاميرا عند فتح النافذة المنبثقة
  useEffect(() => {
    if (!cameraActive) {
      stopCamera();
      return;
    }

    async function initCamera() {
      setCameraError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 640 },
            facingMode: "user",
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err: unknown) {
        console.error("Camera access error:", err);
        setCameraError(
          "تعذر الوصول إلى الكاميرا. يرجى التأكد من توصيل الكاميرا ومنح إذن الاستخدام للمتصفح."
        );
      }
    }

    initCamera();

    return () => {
      stopCamera();
    };
  }, [cameraActive]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  // ضغط وتغيير حجم الصورة لتكون مناسبة وسريعة
  function resizeImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 360;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Image compression is unavailable."));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          let quality = 0.78;
          let compressed = canvas.toDataURL("image/jpeg", quality);
          while (compressed.length * 0.75 > 120 * 1024 && quality > 0.5) {
            quality -= 0.07;
            compressed = canvas.toDataURL("image/jpeg", quality);
          }
          resolve(compressed);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // رفع من الجهاز
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImage(file);
      onPhotoChange(resized);
    } catch (err) {
      console.error("File read error:", err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // التقاط من الكاميرا
  function capturePhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const size = Math.min(video.videoWidth, video.videoHeight) || 400;
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // اقتصاص مربع في المنتصف
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 360, 360);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    setCapturedPreview(dataUrl);
  }

  function confirmCapturedPhoto() {
    if (capturedPreview) {
      onPhotoChange(capturedPreview);
      setCapturedPreview(null);
      setCameraActive(false);
    }
  }

  function retakePhoto() {
    setCapturedPreview(null);
  }

  function closeCameraModal() {
    stopCamera();
    setCameraActive(false);
    setCapturedPreview(null);
    setCameraError("");
  }

  return (
    <div className="resident-photo-box" style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      {/* معاينة الصورة الحالية */}
      <div
        style={{
          width: "90px",
          height: "105px",
          borderRadius: "14px",
          border: "2px dashed #0f766e",
          background: "#f0fdfa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
          boxShadow: "0 4px 12px rgba(15, 118, 110, 0.12)",
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={residentName ? `صورة ${residentName}` : "الصورة الشخصية"}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ textAlign: "center", color: "#0f766e", padding: "8px" }}>

            <span style={{ fontSize: "10px", fontWeight: 700 }}>لا توجد صورة</span>
          </div>
        )}
      </div>

      {/* أزرار الإجراءات */}
      {!disabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
            الصورة الشخصية للنزيل:
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {/* زر رفع من الجهاز */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid #0f766e",
                background: "#f0fdfa",
                color: "#0f766e",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >

              <span>رفع من الجهاز</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />

            {/* زر فتح الكاميرا */}
            <button
              type="button"
              onClick={() => setCameraActive(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid #2563eb",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >

              <span>التقاط بالكاميرا الآن</span>
            </button>

            {/* زر الحذف إن وُجدت */}
            {photoUrl && (
              <button
                type="button"
                onClick={() => onPhotoChange("")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid #fecdd3",
                  background: "#fff1f2",
                  color: "#e11d48",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >

                <span>حذف الصورة</span>
              </button>
            )}
          </div>
          <span style={{ fontSize: "10px", color: "#64748b" }}>
            تظهر الصورة في الملف الشخصي واستمارة القيد الرسمية عند الطباعة (A4).
          </span>
        </div>
      )}

      {/* نافذة التقاط الكاميرا المنبثقة */}
      {cameraActive && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          dir="rtl"
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              borderRadius: "20px",
              background: "#ffffff",
              boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
              overflow: "hidden",
              border: "1px solid #cbd5e1",
            }}
          >
            {/* رأس النافذة */}
            <div
              style={{
                padding: "16px 20px",
                background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

                <span style={{ fontWeight: 800, fontSize: "14px" }}>
                  التقاط صورة شخصية مباشرة
                </span>
              </div>
              <button
                type="button"
                onClick={closeCameraModal}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: 0,
                  color: "#fff",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  cursor: "pointer",
                  fontSize: "14px",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* منطقة المعاينة */}
            <div style={{ padding: "20px", textAlign: "center" }}>
              {cameraError ? (
                <div
                  style={{
                    padding: "20px",
                    background: "#fef2f2",
                    borderRadius: "12px",
                    color: "#991b1b",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {cameraError}
                </div>
              ) : capturedPreview ? (
                // عرض الصورة الملتقطة
                <div>
                  <div
                    style={{
                      width: "260px",
                      height: "260px",
                      margin: "0 auto",
                      borderRadius: "16px",
                      overflow: "hidden",
                      border: "3px solid #0f766e",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capturedPreview}
                      alt="معاينة الصورة الملتقطة"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <p style={{ marginTop: "10px", fontSize: "12px", color: "#0f766e", fontWeight: 700 }}>
                    ✓ تم التقاط الصورة بنجاح!
                  </p>
                </div>
              ) : (
                // عرض فيديو الكاميرا المباشر
                <div>
                  <div
                    style={{
                      width: "280px",
                      height: "280px",
                      margin: "0 auto",
                      borderRadius: "16px",
                      overflow: "hidden",
                      border: "3px solid #cbd5e1",
                      background: "#000000",
                      position: "relative",
                    }}
                  >
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: "scaleX(-1)", // مرآة للتصوير السيلفي
                      }}
                    />
                    {/* إطار دليلي للوجه */}
                    <div
                      style={{
                        position: "absolute",
                        inset: "20px",
                        border: "2px dashed rgba(255,255,255,0.6)",
                        borderRadius: "50%",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                  <p style={{ marginTop: "10px", fontSize: "11px", color: "#64748b" }}>
                    ضع وجه النزيل داخل الإطار ثم اضغط على زر الالتقاط.
                  </p>
                </div>
              )}
            </div>

            {/* أزرار التحكم بالنافذة */}
            <div
              style={{
                padding: "14px 20px",
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={closeCameraModal}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#475569",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                إلغاء
              </button>

              {capturedPreview ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={retakePhoto}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      color: "#334155",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    🔄 إعادة التقاط
                  </button>
                  <button
                    type="button"
                    onClick={confirmCapturedPhoto}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "10px",
                      border: 0,
                      background: "#0f766e",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(15,118,110,0.3)",
                    }}
                  >
                    ✓ استخدام هذه الصورة
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(cameraError)}
                  onClick={capturePhoto}
                  style={{
                    padding: "10px 24px",
                    borderRadius: "12px",
                    border: 0,
                    background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 800,
                    cursor: cameraError ? "not-allowed" : "pointer",
                    opacity: cameraError ? 0.5 : 1,
                    boxShadow: "0 4px 16px rgba(15,118,110,0.35)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >

                  <span>التقاط الصورة الآن</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

