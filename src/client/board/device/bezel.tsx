import {
  BEZEL_COLORS,
  BEZELS,
  bezelShadow,
  type Device,
  FOLDABLE_ISLAND,
  foldBand,
  HOME_BAR,
  islandCenter,
  LAPTOP_BASE,
  laptopParts,
  PHONE_ISLAND,
  type Pose,
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
  pose = 'closed',
}: {
  device: Device
  /** The frame's box, which a laptop's chin and base span. */
  width: number
  height: number
  /** How a foldable is held, which no other device reads. */
  pose?: Pose
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
      {device === 'foldable' ? <FoldableMarks pose={pose} /> : null}
    </div>
  )
}

/**
 * A foldable's island and home bar, with the band down the inner screen's
 * middle. Half open's band runs over the body too, which darkens at the fold.
 */
function FoldableMarks({ pose }: { pose: Pose }) {
  const band = foldBand(pose)
  const reach = pose === 'half' ? -BEZELS.foldable.border : 0
  return (
    <>
      {band ? (
        <span
          data-bezel-fold={pose}
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: reach,
            bottom: reach,
            width: band.width,
            background: band.background,
          }}
        />
      ) : null}
      <span
        data-bezel-island
        className="absolute -translate-x-1/2"
        style={{
          left: `${islandCenter(pose) * 100}%`,
          top: FOLDABLE_ISLAND.top,
          width: FOLDABLE_ISLAND.width,
          height: FOLDABLE_ISLAND.height,
          borderRadius: FOLDABLE_ISLAND.height / 2,
          background: BEZEL_COLORS.island,
        }}
      />
      <HomeBar />
    </>
  )
}

function HomeBar() {
  return (
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
      <HomeBar />
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
