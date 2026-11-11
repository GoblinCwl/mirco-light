export default function LoadingStars({ label }: { label: string }) {
  return (
    <span class="loading-stars" role="status" aria-label={label}>
      {Array.from({ length: 5 }, () => <i aria-hidden="true" />)}
    </span>
  )
}
