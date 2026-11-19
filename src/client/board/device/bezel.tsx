import {
  BEZEL_COLORS,
  BEZELS,
  bezelShadow,
  BUTTON_DEPTH,
  type Device,
  FOLDABLE_ISLAND,
  foldBand,
  HOME_BAR,
  type Island,
  islandCenter,
  LAPTOP_BASE,
  laptopParts,
  PHONE_BUTTONS,
  phoneIsland,
  type Pose,
  screenCorners,
  WIDE_ISLAND_LEVEL,
  WIDE_ISLAND_TIMER,
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
  island = 'compact',
}: {
  device: Device
  /** The frame's box, which a laptop's chin and base span. */
  width: number
  height: number
  /** How a foldable is held, which no other device reads. */
  pose?: Pose
  /** The phone's island width, which no other device reads. */
  island?: Island
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
      {device === 'phone' ? <PhoneMarks island={island} /> : null}
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

function PhoneMarks({ island }: { island: Island }) {
  const { width, height, top } = phoneIsland(island)
  const { border } = BEZELS.phone
  return (
    <>
      {PHONE_BUTTONS.map(({ side, top: from, height: length }) => (
        <span
          key={`${side} ${from}`}
          data-bezel-button={side}
          className="absolute"
          style={{
            [side]: -border - BUTTON_DEPTH,
            top: from - border,
            width: BUTTON_DEPTH,
            height: length,
            borderRadius: BUTTON_DEPTH / 2,
            background: BEZEL_COLORS.button,
          }}
        />
      ))}
      <span
        data-bezel-island
        className="absolute left-1/2 flex -translate-x-1/2 items-center justify-between px-[11px] text-[11px] leading-none font-semibold tabular-nums"
        style={{
          top,
          width,
          height,
          borderRadius: height / 2,
          background: BEZEL_COLORS.island,
          color: BEZEL_COLORS.islandText,
        }}
      >
        {island === 'wide' ? <IslandTimer /> : null}
      </span>
      <HomeBar />
    </>
  )
}

/** The wide island's running timer, a live dot and its time, with a level on the right. */
function IslandTimer() {
  return (
    <>
      <span data-bezel-timer className="flex items-center gap-[5px]">
        <span
          className="size-[6px] rounded-full"
          style={{ background: BEZEL_COLORS.islandLive }}
        />
        {WIDE_ISLAND_TIMER}
      </span>
      <span className="flex items-end gap-[2px]">
        {WIDE_ISLAND_LEVEL.map((tall) => (
          <span
            key={tall}
            className="w-[2px] rounded-[1px]"
            style={{ height: tall, background: BEZEL_COLORS.islandLive }}
          />
        ))}
      </span>
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
