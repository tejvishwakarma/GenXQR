import { useRef, useState } from "react"
import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function MP3LandingPage({ name, content, files }: Props) {
  const title = (content.title as string) || name
  const artist = content.artist as string | undefined
  const description = content.description as string | undefined
  const mp3File = files.find((f) => f.fileType === "MP3")
  const coverFile = files.find((f) => f.fileType === "IMAGE")
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const accent = "#8b5cf6"

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      void audioRef.current.play()
    }
    setPlaying((p) => !p)
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100
    setProgress(isNaN(pct) ? 0 : pct)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = pct * audioRef.current.duration
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-900 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm">
        {/* Album cover */}
        <div className="mb-6">
          {coverFile ? (
            <img src={coverFile.fileUrl} alt={title}
              className="w-56 h-56 rounded-3xl object-cover mx-auto shadow-2xl" />
          ) : (
            <div className="w-56 h-56 rounded-3xl mx-auto shadow-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${accent}, #6d28d9)` }}>
              <span className="text-6xl">🎵</span>
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {artist && <p className="text-purple-300 text-sm mt-1">{artist}</p>}
          {description && <p className="text-purple-400 text-sm mt-2">{description}</p>}
        </div>

        {mp3File ? (
          <>
            <audio
              ref={audioRef}
              src={mp3File.fileUrl}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setPlaying(false)}
            />

            {/* Progress bar */}
            <div
              className="w-full h-1.5 bg-white/20 rounded-full mb-6 cursor-pointer"
              onClick={handleSeek}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: accent }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105"
                style={{ background: accent }}
              >
                {playing ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
            </div>

            <a href={mp3File.fileUrl} download={mp3File.fileName}
              className="mt-6 flex items-center justify-center gap-2 text-purple-300 text-sm hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </a>
          </>
        ) : (
          <p className="text-center text-purple-400">Audio file not available</p>
        )}
      </div>

      <p className="mt-8 text-xs text-purple-800">Powered by GenXQR</p>
    </div>
  )
}
