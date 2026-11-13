import { type NetworkInterfaceInfo, networkInterfaces } from 'node:os'

import { FRAME_EXTENSION } from '@/shared/board-files'

type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>

/**
 * The private IPv4 ranges a home or office network hands out, in the order a
 * phone is likeliest to share: Wi-Fi routers mostly give 192.168, and 172.16
 * to 172.31 is where container and VM bridges sit.
 */
const PRIVATE_RANGES: ((octets: number[]) => boolean)[] = [
  ([a, b]) => a === 192 && b === 168,
  ([a]) => a === 10,
  ([a, b = 0]) => a === 172 && b >= 16 && b <= 31,
]

/**
 * This machine's IPv4 address on a local network, the one a phone on the same
 * Wi-Fi can reach, or null when the machine has none. A loopback, a
 * link-local, or a public address is never picked.
 */
export function networkAddress(
  interfaces: Interfaces = networkInterfaces(),
): string | null {
  const candidates = Object.values(interfaces)
    .flatMap((infos) => infos ?? [])
    .filter((info) => info.family === 'IPv4' && !info.internal)
    .map((info) => info.address)
  for (const inRange of PRIVATE_RANGES) {
    const found = candidates.find((address) =>
      inRange(address.split('.').map(Number)),
    )
    if (found !== undefined) return found
  }
  return null
}

export interface LinkParts {
  address: string
  port: number
  token: string
  project: string
  page: string
  frame: string
}

/** The link a phone opens, landing on one frame of the project the listener serves. */
export function previewLink({
  address,
  port,
  token,
  project,
  page,
  frame,
}: LinkParts): string {
  const path = [project, page, `${frame}${FRAME_EXTENSION}`]
    .map(encodeURIComponent)
    .join('/')
  return `http://${address}:${port}/v/${token}/frames/${path}`
}
