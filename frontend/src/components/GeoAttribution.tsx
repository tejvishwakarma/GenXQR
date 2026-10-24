/**
 * The credit the GeoLite End User License Agreement requires ("You must provide
 * attribution of your use to MaxMind"; their example text and link, below).
 * Shown wherever scan locations — which come from GeoLite — are displayed.
 */
export function GeoAttribution() {
  return (
    <p className="mt-3 text-[10px] text-zinc-400">
      This product includes GeoLite Data created by MaxMind, available from{" "}
      <a href="https://www.maxmind.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
        https://www.maxmind.com
      </a>
      .
    </p>
  )
}
