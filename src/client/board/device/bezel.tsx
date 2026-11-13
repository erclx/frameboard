import {
  BEZEL_COLORS,
  BEZELS,
  bezelShadow,
  type Device,
  HOME_BAR,
  PHONE_ISLAND,
} from '@/shared/frame-device'

/**
 * The device drawn around a frame's box, in board units so it scales with
 * the canvas as the frame does. It lies over the frame's page, rounding its
 * corners to the screen radius, with the phone's island and home bar, and
 * takes no pointer events, so a click reaches the frame as it would bare.
 */
export function Bezel({ device }: { device: Device }) {
  const { screenRadius } = BEZELS[device]
  return (
    <div
      aria-hidden
      data-bezel={device}
      className="pointer-events-none absolute inset-0"
      style={{ borderRadius: screenRadius, boxShadow: bezelShadow(device) }}
    >
      {device === 'phone' ? (
        <>
          <span
            data-bezel-island
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: PHONE_ISLAND.top,
              width: PHONE_ISLAND.width,
              height: PHONE_ISLAND.height,
              borderRadius: PHONE_ISLAND.height / 2,
              background: BEZEL_COLORS.island,
            }}
          />
          <span
            data-bezel-home
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: HOME_BAR.bottom,
              width: HOME_BAR.width,
              height: HOME_BAR.height,
              borderRadius: HOME_BAR.height / 2,
              background: BEZEL_COLORS.homeBar,
            }}
          />
        </>
      ) : null}
    </div>
  )
}
