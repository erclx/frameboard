# Changelog

## [0.4.0](https://github.com/erclx/frameboard/compare/v0.3.0...v0.4.0) (2026-10-19)


### Features

* **board:** add frame layers actions, the Frame tool, and a clipboard ([#43](https://github.com/erclx/frameboard/issues/43)) ([ba57236](https://github.com/erclx/frameboard/commit/ba572366ed7f53e470c80845bda4bf38cd98c94f))
* **board:** mark the frames an agent changed until the developer looks ([#48](https://github.com/erclx/frameboard/issues/48)) ([ceec8bd](https://github.com/erclx/frameboard/commit/ceec8bdf9c833f8efb822b525855ccaef97831be))
* **claims:** claim frames with editing and draw the claims on the board ([#44](https://github.com/erclx/frameboard/issues/44)) ([c3d77a6](https://github.com/erclx/frameboard/commit/c3d77a62e2aa11a5807903cb475b18117eeeb540))
* **home:** add, rename, duplicate, and delete projects from home ([#47](https://github.com/erclx/frameboard/issues/47)) ([21363c1](https://github.com/erclx/frameboard/commit/21363c128421798b3cdac2ab28272dc20bef3f96))
* **inspector:** edit a selected element's look and text by hand ([#46](https://github.com/erclx/frameboard/issues/46)) ([157bcea](https://github.com/erclx/frameboard/commit/157bcea7ccf5e591efb2b269c346c31a241c1967))

## [0.3.0](https://github.com/erclx/frameboard/compare/v0.2.0...v0.3.0) (2026-10-19)


### Features

* **board:** select and walk elements inside a frame, and report them ([#37](https://github.com/erclx/frameboard/issues/37)) ([cd9ee7a](https://github.com/erclx/frameboard/commit/cd9ee7a68ce4f1daf83ddecc720d904c00bff7d3))
* **board:** undo hand changes and add, rename, reorder, delete pages ([#38](https://github.com/erclx/frameboard/issues/38)) ([998c525](https://github.com/erclx/frameboard/commit/998c525c279b692154257b3bcb382fb58e2f21df))
* **checks:** report clipping, scrollbars, viewport, and font size ([#40](https://github.com/erclx/frameboard/issues/40)) ([7d2f9a1](https://github.com/erclx/frameboard/commit/7d2f9a1cceea42bf6c1e23d8c46e40c42ddb1d4e))
* **palette:** add the command palette and keyboard shortcuts sheet ([#35](https://github.com/erclx/frameboard/issues/35)) ([7d73284](https://github.com/erclx/frameboard/commit/7d732843599a28a06994b248214482cb7688dec3))


### Bug Fixes

* **test:** repair the canvas perf and watch tests ([#34](https://github.com/erclx/frameboard/issues/34)) ([00021ab](https://github.com/erclx/frameboard/commit/00021abb616195c465defe518bc33fae1d4a7d21))

## [0.2.0](https://github.com/erclx/frameboard/compare/v0.1.0...v0.2.0) (2026-10-19)


### Features

* **assets:** add the Assets tab to list, drop, and copy asset paths ([#33](https://github.com/erclx/frameboard/issues/33)) ([6fac8f9](https://github.com/erclx/frameboard/commit/6fac8f9c214d34e7d38cab981fd4527d9e1b6702))
* **board:** select, move, resize, snap, and arrange frames by hand ([#32](https://github.com/erclx/frameboard/issues/32)) ([8c8141b](https://github.com/erclx/frameboard/commit/8c8141bf5518c976b933cd5c5a37983924647f9f))
* **capture:** add inspect to read frame elements by edit index ([#29](https://github.com/erclx/frameboard/issues/29)) ([97fcde0](https://github.com/erclx/frameboard/commit/97fcde00469dbe9af73b0a05aca60a4f9e858b90))
* **capture:** capture frames and pages in either theme, and fit frames ([#25](https://github.com/erclx/frameboard/issues/25)) ([2f34248](https://github.com/erclx/frameboard/commit/2f3424860bc11ee75f09c103a07cfd73ca4c79aa))
* **notes:** pin notes and send them to a listening agent session ([#31](https://github.com/erclx/frameboard/issues/31)) ([92ee318](https://github.com/erclx/frameboard/commit/92ee318d627190611994fac6f0cdc09e2f6e150a))
* **server:** lock board writes to the tab serve opens ([#23](https://github.com/erclx/frameboard/issues/23)) ([dcbfc76](https://github.com/erclx/frameboard/commit/dcbfc76aa56ae7eaa313e48a1c75427238d071e7))
* **theme:** give frames shared tokens, faces, and light and dark ([#27](https://github.com/erclx/frameboard/issues/27)) ([fa8e77d](https://github.com/erclx/frameboard/commit/fa8e77dd78699f0e47e261b3a6d0b50c444e3e31))


### Bug Fixes

* **capture:** let a frame that declares no font capture on Linux ([#30](https://github.com/erclx/frameboard/issues/30)) ([966d885](https://github.com/erclx/frameboard/commit/966d8857ea93de289755761ef5bfb404ec2cf780))

## [0.1.0](https://github.com/erclx/frameboard/compare/v0.0.1...v0.1.0) (2026-10-18)


### Features

* **board:** add the board folder model and the structure verbs ([#6](https://github.com/erclx/frameboard/issues/6)) ([ab1153b](https://github.com/erclx/frameboard/commit/ab1153bf866cfc24b290e872f4e89297a566dcce))
* **board:** add the board shell, its action registry, and the home view ([#14](https://github.com/erclx/frameboard/issues/14)) ([47d4577](https://github.com/erclx/frameboard/commit/47d45778ba008ed78bf6b2be065614ac874a800b))
* **board:** watch frames appear and reload live on a pannable canvas ([#9](https://github.com/erclx/frameboard/issues/9)) ([d609955](https://github.com/erclx/frameboard/commit/d6099556c1a8ec956a2c97d83303706fac47146b))
* **check:** hand content check findings back to the agent and the board ([#10](https://github.com/erclx/frameboard/issues/10)) ([22a0d69](https://github.com/erclx/frameboard/commit/22a0d69ae407b99587c8839638cefd6c59cb1187))
* **design:** add tracked design references and the sync command ([#12](https://github.com/erclx/frameboard/issues/12)) ([d1026ea](https://github.com/erclx/frameboard/commit/d1026eaa6b3e61e6785ba3a95398b94f452bd569))
* **edit:** splice frame edits at parse5 source offsets ([#7](https://github.com/erclx/frameboard/issues/7)) ([dac8f33](https://github.com/erclx/frameboard/commit/dac8f3368945bd01035527113e6281f5418b97c2))

## 0.0.1 (2026-10-15)


### Features

* **repo:** add the open-source files, plugin, and requirements ([#2](https://github.com/erclx/frameboard/issues/2)) ([1431c2c](https://github.com/erclx/frameboard/commit/1431c2c410f30919ef9ecea53b537901ce1aecfc))
* **theme:** carry the picked chrome look into tokens and icons ([#4](https://github.com/erclx/frameboard/issues/4)) ([d6c4fb6](https://github.com/erclx/frameboard/commit/d6c4fb69fabac16571f5b1ea89a7cb480f6728e7))
