import type { CSSProperties } from 'react'

import { cn } from '@/client/lib/cn'
import { STEP_MS, type StepEffect } from '@/shared/present-transition'

import { EASING, layerStyle } from '../present/keyframes'
import type { Travel } from '../present/travel'

/**
 * What a tile draws. A transition plays both layers of its arrival, a step
 * plays one element's entrance, and a still tile draws the slide alone.
 */
export type TilePicture =
  | { kind: 'transition'; travel: Travel; project: string }
  | { kind: 'step'; effect: StepEffect }
  | { kind: 'still' }

/**
 * How far into its motion a tile rests, so each tile at rest, and every tile
 * under reduced motion, still shows which motion it is.
 */
const REST = 0.4

/** A step rests later, since Fly's element sits below the picture until past half way. */
const STEP_REST = 0.7

/** An animation shorthand held at the rest pose rather than playing. */
function resting(animation: string, ms: number, at = REST): string {
  return `${animation} ${-Math.round(ms * at)}ms paused`
}

function transitionLayer(
  role: 'enter' | 'leave',
  travel: Travel,
  project: string,
  playing: boolean,
): CSSProperties {
  const style = layerStyle(role, travel, project)
  const animation = String(style.animation ?? '')
  return {
    ...style,
    animation: playing ? animation : resting(animation, travel.transition.ms),
  }
}

function stepLayer(effect: StepEffect, playing: boolean): CSSProperties {
  const animation = `frameboard-step-${effect} ${STEP_MS}ms ${EASING} both`
  return {
    animation: playing ? animation : resting(animation, STEP_MS, STEP_REST),
  }
}

/**
 * One tile's picture, two small layers playing the real keyframes once while
 * `playing` and holding a pose otherwise. A play ends through
 * `onPlayed`, keyed by the caller so each play starts from the first frame.
 */
export function EffectTile({
  picture,
  playing,
  onPlayed,
}: {
  picture: TilePicture
  playing: boolean
  onPlayed: () => void
}) {
  const layer = 'absolute inset-x-2.5 inset-y-1.5 rounded-[2px]'
  return (
    <span
      aria-hidden
      data-tile-picture={picture.kind}
      className="relative block h-[30px] overflow-hidden rounded-[4px] bg-input perspective-[120px] group-aria-checked:bg-sidebar"
    >
      {picture.kind === 'transition' ? (
        <>
          <span
            data-tile-layer="leave"
            className={cn(layer, 'bg-faint')}
            style={transitionLayer(
              'leave',
              picture.travel,
              picture.project,
              playing,
            )}
          />
          <span
            data-tile-layer="enter"
            className={cn(layer, 'bg-foreground/80')}
            style={transitionLayer(
              'enter',
              picture.travel,
              picture.project,
              playing,
            )}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) onPlayed()
            }}
          />
        </>
      ) : picture.kind === 'step' ? (
        <>
          <span className="absolute inset-x-1.5 top-1.5 h-1 rounded-full bg-faint" />
          <span
            data-tile-layer="enter"
            className="absolute inset-x-1.5 top-3.5 bottom-1.5 rounded-[2px] bg-foreground/80"
            style={stepLayer(picture.effect, playing)}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) onPlayed()
            }}
          />
        </>
      ) : (
        <span
          data-tile-layer="enter"
          className={cn(layer, 'bg-foreground/80')}
        />
      )}
    </span>
  )
}
