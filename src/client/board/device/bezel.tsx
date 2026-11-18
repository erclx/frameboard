import {
  BEZEL_COLORS,
  bezelShadow,
  type Device,
  HOME_BAR,
  LAPTOP_BASE,
  laptopParts,
  PHONE_ISLAND,
  screenCorners,
} from '@/shared/frame-device'

/** One screen pixel at any zoom, the width of the body's edge. */
const EDGE = 'calc(1px / var(--zoom, 1))'

/**
 * The device around a frame's box in board units, taking no pointer events,
 * so a click reaches the frame as it would bare.
 */
export function Bezel({
  device,
  width,
  height,
}: {
  device: Device
  /** The frame's box, which a laptop's chin and base span. */
  width: number
  height: number
}) {
  const laptop = device === 'laptop'
  return (
    <div
      aria-hidden
      data-bezel={device}
      className="pointer-events-none absolute inset-0"
      style={{
        borderRadius: screenCorners(device),
        boxShadow: bezelShadow(device),
      }}
    >
      {device === 'phone' ? <PhoneMarks /> : null}
      {laptop ? <LaptopBody width={width} height={height} /> : null}
    </div>
  )
}

function PhoneMarks() {
  return (
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
  )
}

/**
 * The lid's chin and the base below it, drawn as boxes past the frame's
 * bottom, since the lid's spread holds one width on every side. The chin's
 * sides carry the lid's edge down to the base, which rings its own.
 */
function LaptopBody({ width, height }: { width: number; height: number }) {
  const { chin, base } = laptopParts({ width, height })
  return (
    <>
      <span
        data-bezel-chin
        className="absolute border-x border-solid"
        style={{
          left: `calc(${chin.x}px - ${EDGE})`,
          top: chin.y,
          width: `calc(${chin.width}px + 2 * ${EDGE})`,
          height: chin.height,
          borderColor: BEZEL_COLORS.edge,
          borderLeftWidth: EDGE,
          borderRightWidth: EDGE,
          background: BEZEL_COLORS.body,
        }}
      />
      <span
        data-bezel-base
        className="absolute"
        style={{
          left: base.x,
          top: base.y,
          width: base.width,
          height: base.height,
          borderRadius: `0 0 ${LAPTOP_BASE.radius}px ${LAPTOP_BASE.radius}px`,
          background: BEZEL_COLORS.base,
          boxShadow: `0 0 0 ${EDGE} ${BEZEL_COLORS.edge}`,
        }}
      />
    </>
  )
}
