import type { PublicQRFile } from "@/lib/api"

interface Props {
  name: string
  content: Record<string, unknown>
  design: Record<string, unknown>
  files: PublicQRFile[]
}

export default function AppLandingPage({ name, content, files }: Props) {
  const appName = (content.appName as string) || name
  const description = content.description as string | undefined
  const appStoreUrl = (content.iosUrl ?? content.appStoreUrl) as string | undefined
  const playStoreUrl = (content.androidUrl ?? content.playStoreUrl) as string | undefined
  const huaweiUrl = (content.huaweiUrl ?? content.huawei_url) as string | undefined
  const iconFile = files.find((f) => f.fileType === "IMAGE")
  const accent = "#4f46e5"

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm text-center">
        {/* App icon */}
        {iconFile ? (
          <img src={iconFile.fileUrl} alt={appName}
            className="w-24 h-24 rounded-3xl mx-auto mb-4 shadow-2xl" />
        ) : (
          <div className="w-24 h-24 rounded-3xl mx-auto mb-4 shadow-2xl flex items-center justify-center text-white text-4xl font-bold"
            style={{ background: accent }}>
            {appName.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className="text-2xl font-bold text-white mb-2">{appName}</h1>
        {description && <p className="text-gray-400 text-sm mb-8 max-w-xs mx-auto">{description}</p>}

        {/* Store buttons */}
        <div className="space-y-3">
          {appStoreUrl && (
            <a href={appStoreUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-black rounded-2xl border border-gray-700 hover:border-gray-500 transition-colors">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.2 1.28-2.18 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.77M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div className="text-left">
                <p className="text-xs text-gray-400">Download on the</p>
                <p className="text-base font-semibold text-white">App Store</p>
              </div>
            </a>
          )}

          {playStoreUrl && (
            <a href={playStoreUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-black rounded-2xl border border-gray-700 hover:border-gray-500 transition-colors">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.303l-10.93-6.33 8.63 8.63 2.3-2.3zM17.398 12l2.302 1.328V10.67L17.398 12z" fill="#34A853"/>
              </svg>
              <div className="text-left">
                <p className="text-xs text-gray-400">Get it on</p>
                <p className="text-base font-semibold text-white">Google Play</p>
              </div>
            </a>
          )}

          {huaweiUrl && (
            <a href={huaweiUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-black rounded-2xl border border-gray-700 hover:border-gray-500 transition-colors">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#CF0A2C"/>
                <path d="M12 6.5c-3.03 0-5.5 2.47-5.5 5.5s2.47 5.5 5.5 5.5 5.5-2.47 5.5-5.5S15.03 6.5 12 6.5zm2.5 6.25h-2v2a.75.75 0 01-1.5 0v-2h-2a.75.75 0 010-1.5h2v-2a.75.75 0 011.5 0v2h2a.75.75 0 010 1.5z" fill="#CF0A2C"/>
              </svg>
              <div className="text-left">
                <p className="text-xs text-gray-400">Explore it on</p>
                <p className="text-base font-semibold text-white">AppGallery</p>
              </div>
            </a>
          )}

          {!appStoreUrl && !playStoreUrl && !huaweiUrl && (
            <p className="text-gray-500 text-sm">No store links available</p>
          )}
        </div>
      </div>

      <p className="absolute bottom-4 text-xs text-gray-600">Powered by GenXQR</p>
    </div>
  )
}
