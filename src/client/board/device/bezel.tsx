import {
  BATTERY,
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
  isTurned,
  LAPTOP_BASE,
  laptopParts,
  type PageColors,
  PHONE_BUTTONS,
  phoneIsland,
  type Pose,
  screenCorners,
  SIGNAL_BARS,
  STATUS_BAR,
  STATUS_FONT,
  type Turn,
  WIDE_ISLAND_LEVEL,
  WIDE_ISLAND_TIMER,
} from '@/shared/frame-device'
import type { Theme } from '@/shared/theme'

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
  turn = 'upright',
  colors,
  theme,
}: {
  device: Device
  /** The frame's box, which a laptop's chin and base span. */
  width: number
  height: number
  /** How a foldable is held, which no other device reads. */
  pose?: Pose
  /** The phone's island width, which no other device reads. */
  island?: Island
  /** How a phone or tablet is held, which moves a phone's island and buttons and hides its status bar. */
  turn?: Turn
  /** The page's fill and text color, which the phone's status bar paints, its theme's own until the page reports them. */
  colors?: PageColors | null
  /** The frame's theme, which a page painting no fill shows through the status bar. */
  theme?: Theme
}) {
  const laptop = device === 'laptop'
  const turned = isTurned(device, turn)
  return (
    <div
      aria-hidden
      data-bezel={device}
      data-bezel-turn={turned ? turn : undefined}
      className="pointer-events-none absolute inset-0"
      style={{
        borderRadius: screenCorners(device),
        boxShadow: bezelShadow(device),
      }}
    >
      {device === 'phone' && !turned ? (
        <>
          <StatusBar colors={colors ?? null} theme={theme} />
          <PhoneMarks island={island} />
        </>
      ) : null}
      {device === 'phone' && turned && turn !== 'upright' ? (
        <TurnedPhoneMarks island={island} turn={turn} />
      ) : null}
      {laptop ? <LaptopBody width={width} height={height} /> : null}
      {device === 'foldable' ? <FoldableMarks pose={pose} /> : null}
    </div>
  )
}

/**
 * The phone's status bar over the strip above the page, in the page's fill
 * and text color, with the time on the left and the signal and battery on
 * the right, both in the island's band.
 */
function StatusBar({
  colors,
  theme,
}: {
  colors: PageColors | null
  theme?: Theme
}) {
  const { screenRadius } = BEZELS.phone
  return (
    <div
      data-bezel-status
      className="absolute inset-x-0 top-0"
      style={{
        height: STATUS_BAR.height,
        background: colors?.fill ?? 'Canvas',
        color: colors?.ink ?? 'CanvasText',
        colorScheme: theme,
        borderRadius: `${screenRadius}px ${screenRadius}px 0 0`,
      }}
    >
      <div
        className="absolute inset-x-0 flex items-center justify-between leading-none font-semibold tabular-nums"
        style={{
          top: STATUS_BAR.band.top,
          height: STATUS_BAR.band.height,
          paddingInline: STATUS_BAR.side,
          fontSize: STATUS_BAR.font,
          fontFamily: STATUS_FONT,
        }}
      >
        <span data-bezel-time>{STATUS_BAR.time}</span>
        <span className="flex items-center gap-[6px]">
          <span data-bezel-signal className="flex items-end gap-[2px]">
            {SIGNAL_BARS.map((tall) => (
              <span
                key={tall}
                className="w-[3px] rounded-[1px] bg-current"
                style={{ height: tall }}
              />
            ))}
          </span>
          <span data-bezel-battery className="flex items-center">
            <span
              className="box-border flex items-center border border-current p-[1.5px] opacity-90"
              style={{
                width: BATTERY.width,
                height: BATTERY.height,
                borderRadius: BATTERY.radius,
              }}
            >
              <span className="h-full w-4/5 rounded-[2px] bg-current" />
            </span>
            <span
              className="ml-[1px] h-[4px] rounded-r-[1px] bg-current opacity-60"
              style={{ width: BATTERY.cap }}
            />
          </span>
        </span>
      </div>
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
          fontFamily: STATUS_FONT,
        }}
      >
        {island === 'wide' ? <IslandTimer /> : null}
      </span>
      <HomeBar />
    </>
  )
}

/**
 * A turned phone's island on the short side its turn names, standing on end
 * with its timer turned with it, and its buttons on the long edges, each as
 * far from the side the island stands on as it sat from the top upright.
 * Turned left, the left buttons lie along the bottom and the side button
 * along the top, and turned right the other way round.
 */
function TurnedPhoneMarks({
  island,
  turn,
}: {
  island: Island
  turn: 'left' | 'right'
}) {
  const { width, height, top } = phoneIsland(island)
  const { border } = BEZELS.phone
  const from = turn === 'left' ? 'left' : 'right'
  const center = top + height / 2
  return (
    <>
      {PHONE_BUTTONS.map(({ side, top: along, height: length }) => {
        const edge = (side === 'left') === (turn === 'left') ? 'bottom' : 'top'
        return (
          <span
            key={`${side} ${along}`}
            data-bezel-button={edge}
            className="absolute"
            style={{
              [edge]: -border - BUTTON_DEPTH,
              [from]: along - border,
              width: length,
              height: BUTTON_DEPTH,
              borderRadius: BUTTON_DEPTH / 2,
              background: BEZEL_COLORS.button,
            }}
          />
        )
      })}
      <span
        data-bezel-island
        className="absolute top-1/2 flex items-center justify-between px-[11px] text-[11px] leading-none font-semibold tabular-nums"
        style={{
          left: turn === 'left' ? center : `calc(100% - ${center}px)`,
          width,
          height,
          borderRadius: height / 2,
          transform: `translate(-50%, -50%) rotate(${turn === 'left' ? -90 : 90}deg)`,
          background: BEZEL_COLORS.island,
          color: BEZEL_COLORS.islandText,
          fontFamily: STATUS_FONT,
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
