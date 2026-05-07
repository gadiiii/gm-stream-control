"use client"

import { useState, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Upload, Check, X, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"

interface ThumbnailManagerProps {
  className?: string
}

const platformSupport = [
  { platform: "YouTube", supported: true },
  { platform: "Facebook", supported: true },
  { platform: "Instagram", supported: false },
  { platform: "Owncast", supported: true },
]

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png"]

export function ThumbnailManager({ className }: ThumbnailManagerProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const validateAndProcessFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Invalid format. Please use JPG or PNG.")
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      setThumbnail(base64)
      setFileName(file.name)
      setFileSize(file.size)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        validateAndProcessFile(file)
      }
    },
    [validateAndProcessFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        validateAndProcessFile(file)
      }
    },
    [validateAndProcessFile]
  )

  const handleUpload = useCallback(
    async (platform: string) => {
      if (!thumbnail) return

      setIsUploading(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

      try {
        const response = await fetch(`${apiUrl}/api/stream/thumbnail`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            platform: platform.toLowerCase(),
            imageBase64: thumbnail,
          }),
        })

        if (!response.ok) {
          throw new Error("Upload failed")
        }

        toast.success(`Thumbnail updated on ${platform}`)
      } catch {
        toast.error(`Failed to update thumbnail on ${platform}`)
      } finally {
        setIsUploading(false)
      }
    },
    [thumbnail]
  )

  const clearThumbnail = useCallback(() => {
    setThumbnail(null)
    setFileName(null)
    setFileSize(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  return (
    <div className={cn("rounded-[8px] bg-surface border border-border p-4", className)}>
      <h2 className="text-sm font-medium text-text-secondary mb-4">
        Stream Thumbnail
      </h2>

      {/* Drop zone / Preview */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative aspect-video rounded-[6px] border-2 border-dashed transition-colors cursor-pointer overflow-hidden",
          isDragging
            ? "border-accent bg-accent-muted"
            : thumbnail
            ? "border-transparent"
            : "border-border hover:border-text-tertiary bg-elevated"
        )}
      >
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt="Stream thumbnail preview"
              className="w-full h-full object-cover"
            />
            <button
              onClick={(e) => {
                e.stopPropagation()
                clearThumbnail()
              }}
              className="absolute top-2 right-2 p-1.5 rounded-[4px] bg-background/80 text-text-secondary hover:text-text-primary hover:bg-background transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <ImageIcon className="w-8 h-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">
              Drag & drop or click to upload
            </p>
            <p className="text-xs text-text-tertiary">JPG/PNG, max 2MB</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* File info */}
      {fileName && fileSize && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-text-secondary">{fileName}</span>
          <span className="font-mono text-text-tertiary">
            ({formatFileSize(fileSize)})
          </span>
        </div>
      )}

      {/* Platform support */}
      <div className="mt-4 space-y-2">
        <p className="text-xs text-text-tertiary">Platform support:</p>
        <div className="flex flex-wrap gap-2">
          {platformSupport.map(({ platform, supported }) => (
            <div
              key={platform}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] text-xs",
                supported
                  ? "bg-elevated text-text-secondary"
                  : "bg-muted text-text-tertiary"
              )}
            >
              {supported ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <X className="w-3 h-3 text-text-tertiary" />
              )}
              {platform}
            </div>
          ))}
        </div>
      </div>

      {/* Upload button */}
      {thumbnail && (
        <div className="mt-4 flex flex-wrap gap-2">
          {platformSupport
            .filter((p) => p.supported)
            .map(({ platform }) => (
              <Button
                key={platform}
                onClick={() => handleUpload(platform)}
                disabled={isUploading}
                size="sm"
                variant="secondary"
                className="rounded-[6px] text-xs"
              >
                <Upload className="w-3 h-3 mr-1.5" />
                {platform}
              </Button>
            ))}
        </div>
      )}
    </div>
  )
}
