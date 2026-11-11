# Changelog

## [0.31.0](https://github.com/erclx/frameboard/compare/v0.30.0...v0.31.0) (2026-11-11)


### Features

* **assets:** file audio under its own kind chip ([#282](https://github.com/erclx/frameboard/issues/282)) ([395eaf0](https://github.com/erclx/frameboard/commit/395eaf0e77626415e803866e3c22cba3c502784d))
* **canvas:** hold the page left behind until the new one is live ([#287](https://github.com/erclx/frameboard/issues/287)) ([17f52f7](https://github.com/erclx/frameboard/commit/17f52f79c512e393ebd40efe298f85b992889c9d))
* **canvas:** yield the empty page notice to reserved boxes ([#283](https://github.com/erclx/frameboard/issues/283)) ([49c0866](https://github.com/erclx/frameboard/commit/49c08665e5df17a1bd7c0e2f4c5726995e6d08da))
* **layout:** hold a scrolling frame at a screen height ([#291](https://github.com/erclx/frameboard/issues/291)) ([07b589e](https://github.com/erclx/frameboard/commit/07b589ed1e4a183df79fb57c240c7b92012f0ad6))
* **layout:** show one frame file at several widths ([#294](https://github.com/erclx/frameboard/issues/294)) ([0620830](https://github.com/erclx/frameboard/commit/06208301571ffd93a81c46beaf76fadaf28060bb))
* **references:** file a design reference one folder deeper ([#288](https://github.com/erclx/frameboard/issues/288)) ([28dfea4](https://github.com/erclx/frameboard/commit/28dfea4cbb63cfe5e34fa86fc5d86c4efd895ac6))
* **shortcuts:** repeat held nudges, pans, zoom, undo, and redo ([#289](https://github.com/erclx/frameboard/issues/289)) ([f1b9e18](https://github.com/erclx/frameboard/commit/f1b9e188acf3b1b28b56ca80d3355bf9baa18e50))


### Bug Fixes

* **fit:** read content at a reference height and settle each resize ([#284](https://github.com/erclx/frameboard/issues/284)) ([72fc390](https://github.com/erclx/frameboard/commit/72fc39086e40f9b1696759f7a52f5a51672c84da))
* **labels:** match the theme marker's name and raise label focus rings ([#290](https://github.com/erclx/frameboard/issues/290)) ([c098dd9](https://github.com/erclx/frameboard/commit/c098dd98ece7ef24178f6f189c333d084a457719))


### Performance Improvements

* **frames:** revalidate project assets instead of refetching per frame ([#285](https://github.com/erclx/frameboard/issues/285)) ([91c3eda](https://github.com/erclx/frameboard/commit/91c3eda953f18b655e62e2d0b9c7950c16ecacf8))

## [0.30.0](https://github.com/erclx/frameboard/compare/v0.29.0...v0.30.0) (2026-11-11)


### Features

* **canvas:** stage frame mounts and cache faces under the release ([#280](https://github.com/erclx/frameboard/issues/280)) ([ec707c2](https://github.com/erclx/frameboard/commit/ec707c2deb8f6d1f96a45378f0ef88e5445d6451))
* **capture:** wait for images to decode and animations to settle ([#271](https://github.com/erclx/frameboard/issues/271)) ([0999c9e](https://github.com/erclx/frameboard/commit/0999c9e8f9eaed831ed923005738a23382600545))
* **checks:** warn on text under a minimum contrast ratio ([#278](https://github.com/erclx/frameboard/issues/278)) ([f12f571](https://github.com/erclx/frameboard/commit/f12f571fa98f02a41abc511c732f5fcef0031b3e))
* **claims:** reserve planned frames on the board before writing them ([#272](https://github.com/erclx/frameboard/issues/272)) ([b402389](https://github.com/erclx/frameboard/commit/b402389b72e4eded9ac0b6f148bb8398a8c22858))
* **cli:** add project group and archive verbs ([#279](https://github.com/erclx/frameboard/issues/279)) ([af61bc6](https://github.com/erclx/frameboard/commit/af61bc64ec2941adf7c112c9d96c94cb8caf1575))
* **media:** add video posters, media controls, and audio placement ([#275](https://github.com/erclx/frameboard/issues/275)) ([28d18c1](https://github.com/erclx/frameboard/commit/28d18c11ab55dc2639dc2820d73397219e7faf4f))


### Bug Fixes

* **clipboard:** run overlapping WSL copies one at a time ([#277](https://github.com/erclx/frameboard/issues/277)) ([ef3ab41](https://github.com/erclx/frameboard/commit/ef3ab4198b3e19f7ca56f012a98983673af96b09))
* **readme:** clear the corner smudge from the light loop and both stills ([#270](https://github.com/erclx/frameboard/issues/270)) ([5937c2a](https://github.com/erclx/frameboard/commit/5937c2a79470cdfaa196d0e06efccfba796d4c9d))

## [0.29.0](https://github.com/erclx/frameboard/compare/v0.28.0...v0.29.0) (2026-11-11)


### Features

* **canvas:** step between frames from the chip and reveal on click ([#267](https://github.com/erclx/frameboard/issues/267)) ([36f0215](https://github.com/erclx/frameboard/commit/36f021581e1faeeefb793272b55d68171a6a6ab9))
* **home:** add a folder menu, a tab title count, and toast keycaps ([#268](https://github.com/erclx/frameboard/issues/268)) ([f06a69f](https://github.com/erclx/frameboard/commit/f06a69fd70109d6f3fc3513af50ef691d587a1ec))
* **play:** keep the board moving until a frame is entered ([#266](https://github.com/erclx/frameboard/issues/266)) ([ad164bf](https://github.com/erclx/frameboard/commit/ad164bfcc326180bd73e9c02e18ac6977c74314f))
* **web:** rebuild the landing page to the drive's redesign ([#258](https://github.com/erclx/frameboard/issues/258)) ([388852d](https://github.com/erclx/frameboard/commit/388852d01582477c83613daef7d37e61c0cb2d25))


### Bug Fixes

* **checks:** count custom properties a frame script writes as declared ([#265](https://github.com/erclx/frameboard/issues/265)) ([74d1d88](https://github.com/erclx/frameboard/commit/74d1d8846f9d3b737c92f78b854cc39f3c1bbac7))
* **web:** clear three landing defects and redraw the landing record ([#262](https://github.com/erclx/frameboard/issues/262)) ([1571d24](https://github.com/erclx/frameboard/commit/1571d248f0a45fa1a23853a0a156fe8e143c37a7))

## [0.28.0](https://github.com/erclx/frameboard/compare/v0.27.0...v0.28.0) (2026-11-05)


### Features

* **canvas:** cancel section, carry, and marquee drags on Escape ([#242](https://github.com/erclx/frameboard/issues/242)) ([2fefab6](https://github.com/erclx/frameboard/commit/2fefab6cb516ca544e1226f5dc2274d8dde10a6a))
* **inspector:** select the elements using a selection color ([#243](https://github.com/erclx/frameboard/issues/243)) ([4e1883d](https://github.com/erclx/frameboard/commit/4e1883db089ce860e1a571d7b2efa39530693c88))
* **toolbar:** fold the bar in stages to fit its column ([#246](https://github.com/erclx/frameboard/issues/246)) ([7fa3669](https://github.com/erclx/frameboard/commit/7fa366911f1868c1b113cb312c6ce855293f24e8))


### Bug Fixes

* **design:** draw the fill token on the remaining blue references ([#241](https://github.com/erclx/frameboard/issues/241)) ([db3f484](https://github.com/erclx/frameboard/commit/db3f48406dbed4a34ee40a9a410051b7b3d875d7))

## [0.27.0](https://github.com/erclx/frameboard/compare/v0.26.0...v0.27.0) (2026-11-05)


### Features

* **canvas:** cancel a frame move or resize on Escape ([#234](https://github.com/erclx/frameboard/issues/234)) ([aed413f](https://github.com/erclx/frameboard/commit/aed413f9e43a9733c7babc47d36063f4bc967153))
* **canvas:** show a resize cursor over corner marks ([#236](https://github.com/erclx/frameboard/issues/236)) ([ca445c5](https://github.com/erclx/frameboard/commit/ca445c5592b29c12b15c3f357d8dd256eed5ab78))
* **selection:** select and edit several elements in one frame ([#238](https://github.com/erclx/frameboard/issues/238)) ([456f392](https://github.com/erclx/frameboard/commit/456f3926715fbe59a647cd32da0475144676d64a))


### Bug Fixes

* **board:** hold 4.5:1 on white-on-blue controls with the fill token ([#237](https://github.com/erclx/frameboard/issues/237)) ([dc75b7e](https://github.com/erclx/frameboard/commit/dc75b7ea807bb13369c286306b25a0ab9181256d))
* **capture:** make a full evidence run reproduce the committed images ([#240](https://github.com/erclx/frameboard/issues/240)) ([77ac783](https://github.com/erclx/frameboard/commit/77ac78358cac574e35b32a39d939f5af7e2974f3))

## [0.26.0](https://github.com/erclx/frameboard/compare/v0.25.0...v0.26.0) (2026-11-04)


### Features

* **evidence:** adopt canon's gate, add drive states and capture cases ([#224](https://github.com/erclx/frameboard/issues/224)) ([843643c](https://github.com/erclx/frameboard/commit/843643c8877e33364792d9de1a1526607be54381))
* **home:** file projects into folders, filter them, and archive them ([#222](https://github.com/erclx/frameboard/issues/222)) ([dab7b95](https://github.com/erclx/frameboard/commit/dab7b95764640ad5b84790b4dcd21530f095b234))
* **overlay:** resize text, images, and video from their corners ([#232](https://github.com/erclx/frameboard/issues/232)) ([93b6e12](https://github.com/erclx/frameboard/commit/93b6e122c11b3e0e03b3da7e83ca65b279def432))
* **references:** add references sync verb to fill design folders ([#226](https://github.com/erclx/frameboard/issues/226)) ([5db912b](https://github.com/erclx/frameboard/commit/5db912bd0d77b89b3abd389e61f817b0d66a4e80))


### Bug Fixes

* **home:** keep the folder drop hint clear of the target's name ([#229](https://github.com/erclx/frameboard/issues/229)) ([32a4b37](https://github.com/erclx/frameboard/commit/32a4b371834ec8c00436ba2cb8637b6491598a79))
* **inspector:** give selection colors a key of its own beside text ([#228](https://github.com/erclx/frameboard/issues/228)) ([a6b03b1](https://github.com/erclx/frameboard/commit/a6b03b1876cef78c0eb1947d19687ce03a5e898d))
* **toast:** keep the toast stack clear of the bottom toolbar ([#231](https://github.com/erclx/frameboard/issues/231)) ([a34fc5e](https://github.com/erclx/frameboard/commit/a34fc5e1a4a40f6866609274c99df9187377aa5a))
* **tokens:** keep text steps beside a color through cn ([#230](https://github.com/erclx/frameboard/issues/230)) ([7c21a77](https://github.com/erclx/frameboard/commit/7c21a77f8708b5ac8e72d4aa09f0e63392b7c77a))

## [0.25.0](https://github.com/erclx/frameboard/compare/v0.24.0...v0.25.0) (2026-11-03)


### Features

* **board:** toggle Edit and Play on P ([#214](https://github.com/erclx/frameboard/issues/214)) ([339bf2b](https://github.com/erclx/frameboard/commit/339bf2b6c96364f8cb7d34271c77e0cd761e4f16))
* **frames:** answer byte range requests so a video can seek ([#217](https://github.com/erclx/frameboard/issues/217)) ([e6b7ce2](https://github.com/erclx/frameboard/commit/e6b7ce2db56daa73e24d7c1e98a84a3023fafb26))
* **inspector:** drop checks and cap copyable selection colors ([#215](https://github.com/erclx/frameboard/issues/215)) ([939a900](https://github.com/erclx/frameboard/commit/939a90075e1e6f3bced55d3027269d6065d306ca))
* **inspector:** replace a raw selection color with a token ([#220](https://github.com/erclx/frameboard/issues/220)) ([5e57382](https://github.com/erclx/frameboard/commit/5e57382e86d2a8831be86a3f16dc5faaef14f6de))
* **overlay:** hold a dropped outline and ghost an element off its frame ([#219](https://github.com/erclx/frameboard/issues/219)) ([8f3a54d](https://github.com/erclx/frameboard/commit/8f3a54d4ec793e92218d14a7a9bf147b024bcfe9))
* **place:** land new elements where drawn, with a Place toggle ([#221](https://github.com/erclx/frameboard/issues/221)) ([94486a8](https://github.com/erclx/frameboard/commit/94486a81ed4e31d6160c4f10fda82e444e039fbc))
* **place:** make text hug its words in the flow and when placed free ([#212](https://github.com/erclx/frameboard/issues/212)) ([a3467ae](https://github.com/erclx/frameboard/commit/a3467ae3eb6d64fd01f13a64c01229e1c1f30748))
* **show:** show several frames and keep change marks across a restart ([#216](https://github.com/erclx/frameboard/issues/216)) ([57b3500](https://github.com/erclx/frameboard/commit/57b3500b15dc14f6745b7d422da2acde0bbc3dc2))
* **web:** reshoot the launch film and README hero on the current board ([#209](https://github.com/erclx/frameboard/issues/209)) ([cb4ad3c](https://github.com/erclx/frameboard/commit/cb4ad3c8269b8cf420e0fb4f6213c6b66d4c1752))


### Bug Fixes

* **clipboard:** copy several frames each in the theme it shows ([#218](https://github.com/erclx/frameboard/issues/218)) ([ebacc83](https://github.com/erclx/frameboard/commit/ebacc833a764dfc9a75ef726e0004af96b9f32d3))
* **inspector:** let tab leave a segmented row from any button ([#213](https://github.com/erclx/frameboard/issues/213)) ([2be20e3](https://github.com/erclx/frameboard/commit/2be20e366f44df90e9b356ae0c6bdb39a17f6a58))

## [0.24.0](https://github.com/erclx/frameboard/compare/v0.23.0...v0.24.0) (2026-10-31)


### Features

* **clipboard:** copy every selected frame to the clipboard in one paste ([#203](https://github.com/erclx/frameboard/issues/203)) ([195eace](https://github.com/erclx/frameboard/commit/195eacea3b15e255d935cd1fe612a801429f632d))
* **notes:** keep a pinned note on its element through a hand edit ([#204](https://github.com/erclx/frameboard/issues/204)) ([fa1af5a](https://github.com/erclx/frameboard/commit/fa1af5a6a8b8d697df5f1539814d2fb735377bd0))
* **palette:** open on what fits and give every action a row ([#207](https://github.com/erclx/frameboard/issues/207)) ([f2e7dd4](https://github.com/erclx/frameboard/commit/f2e7dd4ce63f2b8de119e778597e5be2a4e5f5b1))


### Bug Fixes

* **plugin:** inform on a version mismatch and name a checkout rebuild ([#205](https://github.com/erclx/frameboard/issues/205)) ([9365ee5](https://github.com/erclx/frameboard/commit/9365ee5dd9c48237d81c939cde5aa8663b2ce9f2))

## [0.23.0](https://github.com/erclx/frameboard/compare/v0.22.0...v0.23.0) (2026-10-31)


### Features

* **changes:** mark every agent change seen from the toast, with undo ([#201](https://github.com/erclx/frameboard/issues/201)) ([50c32d7](https://github.com/erclx/frameboard/commit/50c32d7353433e263b8194a163553cb98b0510d2))
* **sizes:** read presets as width ranges and add social card sizes ([#199](https://github.com/erclx/frameboard/issues/199)) ([943e3b1](https://github.com/erclx/frameboard/commit/943e3b148a16bbd64fb8847abe400a38762b7a64))
* **theme:** edit the board token sheet from the Theme tab ([#200](https://github.com/erclx/frameboard/issues/200)) ([856d782](https://github.com/erclx/frameboard/commit/856d782003df0faf197759cf97e6e4d4c9de6b8c))

## [0.22.0](https://github.com/erclx/frameboard/compare/v0.21.0...v0.22.0) (2026-10-31)


### Features

* **checks:** report each rule at its own level and quiet linked sheets ([#197](https://github.com/erclx/frameboard/issues/197)) ([c5777ae](https://github.com/erclx/frameboard/commit/c5777aebd76514c0a1ecbb412ad5bc3232f0b1b4))
* **notes:** join note pins that would overlap and draw them at 24px ([#196](https://github.com/erclx/frameboard/issues/196)) ([7bc4bbc](https://github.com/erclx/frameboard/commit/7bc4bbc2e3f6cf7b2d5346d4878918d5cc8f215f))
* **plugin:** rename the skill to frameboard:draw ([#194](https://github.com/erclx/frameboard/issues/194)) ([c51f41a](https://github.com/erclx/frameboard/commit/c51f41a263e9d45fe19e7dd533e91b7c9d02dbe5))

## [0.21.0](https://github.com/erclx/frameboard/compare/v0.20.0...v0.21.0) (2026-10-31)


### Features

* **assets:** group, filter, and count files in the Assets tab ([#187](https://github.com/erclx/frameboard/issues/187)) ([69cdcf5](https://github.com/erclx/frameboard/commit/69cdcf5395d63bdad9410df7d8b614af7dfe3373))
* **avatar:** set the name notes are signed with per machine ([#186](https://github.com/erclx/frameboard/issues/186)) ([a37d8ff](https://github.com/erclx/frameboard/commit/a37d8ff2c6730653058e96611739b25b4ceb986e))
* **checks:** warn when a hand value outranks an agent rule change ([#189](https://github.com/erclx/frameboard/issues/189)) ([2607a49](https://github.com/erclx/frameboard/commit/2607a49ddb47529375c853454e757774a329e6e9))
* **inspector:** place an element free in its parent and restack it ([#192](https://github.com/erclx/frameboard/issues/192)) ([ab119c9](https://github.com/erclx/frameboard/commit/ab119c9bb50d98a2fe32d6e58c9b543ded72ebb5))
* **inspector:** set a container's flow, gap, padding, and child size ([#190](https://github.com/erclx/frameboard/issues/190)) ([8a3ad8d](https://github.com/erclx/frameboard/commit/8a3ad8d0eb23b062ffd831df6dfad9a0156bde75))
* **notes:** stack notes on one spot into a count pin with a list ([#188](https://github.com/erclx/frameboard/issues/188)) ([b725b6e](https://github.com/erclx/frameboard/commit/b725b6e516190d8e2e2b226120dabbd8976f47e1))
* **theme:** edit a token in place on the Theme tab ([#191](https://github.com/erclx/frameboard/issues/191)) ([a9c2a31](https://github.com/erclx/frameboard/commit/a9c2a31380ac1b2d46b74cd5b0d62ab0923ec6c5))

## [0.20.0](https://github.com/erclx/frameboard/compare/v0.19.0...v0.20.0) (2026-10-28)


### Features

* **board:** group frames into named sections on a page ([#182](https://github.com/erclx/frameboard/issues/182)) ([2279143](https://github.com/erclx/frameboard/commit/227914352a7d2fd5978ef0e97e54a8062ac57cca))
* **inspector:** add justify, Type details, and a caption type step ([#178](https://github.com/erclx/frameboard/issues/178)) ([f032216](https://github.com/erclx/frameboard/commit/f032216619f617db379d3b23926860ad45fd50ee))
* **inspector:** export a selected frame as a PNG at 1x to 3x ([#179](https://github.com/erclx/frameboard/issues/179)) ([00deca9](https://github.com/erclx/frameboard/commit/00deca93cc8a95972d58fb7303301cd264292ab6))
* **inspector:** resize a selected frame from a size menu ([#177](https://github.com/erclx/frameboard/issues/177)) ([ca00488](https://github.com/erclx/frameboard/commit/ca004887c72afe2f53fd41ce9359e030654445c8))
* **inspector:** rotate and flip an element by hand ([#181](https://github.com/erclx/frameboard/issues/181)) ([e801c25](https://github.com/erclx/frameboard/commit/e801c25165e82cc384dd36857a43bb653d8884c1))
* **place:** place an image or video from assets into a frame ([#176](https://github.com/erclx/frameboard/issues/176)) ([f33e686](https://github.com/erclx/frameboard/commit/f33e6869cf863dab9110e27dcf4f8d2d2dfff891))
* **tooling:** start a source board behind vite in bun run dev ([#175](https://github.com/erclx/frameboard/issues/175)) ([4ca5d2e](https://github.com/erclx/frameboard/commit/4ca5d2e453a83f9943c6fdd384bc2cb5cece148f))

## [0.19.0](https://github.com/erclx/frameboard/compare/v0.18.0...v0.19.0) (2026-10-28)


### Features

* **agent:** teach the skill selection, inspect, and device sizes ([#167](https://github.com/erclx/frameboard/issues/167)) ([a2d3e4c](https://github.com/erclx/frameboard/commit/a2d3e4ca0870afc06b133e4f7bd39fc342f8dd38))
* **canvas:** move note pins with their frame during a resize ([#170](https://github.com/erclx/frameboard/issues/170)) ([ba32057](https://github.com/erclx/frameboard/commit/ba32057b87ab3f30d4f6bc78ed466a65699f00fc))
* **canvas:** open no rename on frame add and hug the rename field ([#172](https://github.com/erclx/frameboard/issues/172)) ([9504ff2](https://github.com/erclx/frameboard/commit/9504ff29f7ba471483d024ef4e88c8f11e950557))
* **inspector:** show a token chip only for a token sheet's names ([#169](https://github.com/erclx/frameboard/issues/169)) ([b576eb5](https://github.com/erclx/frameboard/commit/b576eb5acb2980f6c2271464d62a7ae8c52fcf55))
* **pages:** grow the pages list to fit a new page from a four-row start ([#171](https://github.com/erclx/frameboard/issues/171)) ([76b9e10](https://github.com/erclx/frameboard/commit/76b9e1017f50058c4a561ce00c878cb121f7b008))


### Bug Fixes

* **guide:** draw the agent step radio ring in muted-foreground ([#168](https://github.com/erclx/frameboard/issues/168)) ([a272214](https://github.com/erclx/frameboard/commit/a272214366242d3024a7aaf9821853d19050a39d))

## [0.18.0](https://github.com/erclx/frameboard/compare/v0.17.0...v0.18.0) (2026-10-27)


### Features

* **access:** mint a fresh edit link per open on preview servers ([#163](https://github.com/erclx/frameboard/issues/163)) ([828c75f](https://github.com/erclx/frameboard/commit/828c75fb2578714d4706042ef1090410287bf412))
* **canvas:** shift note pins with their frame during a drag ([#159](https://github.com/erclx/frameboard/issues/159)) ([a2c6ebd](https://github.com/erclx/frameboard/commit/a2c6ebdcadf043ef42f884ba36f6c4012244ea10))


### Bug Fixes

* **chrome:** lift quiet captions and chevrons past the faint token ([#162](https://github.com/erclx/frameboard/issues/162)) ([a241ad6](https://github.com/erclx/frameboard/commit/a241ad662a3282634139cc5b1ee7a3dc4045b322))

## [0.17.0](https://github.com/erclx/frameboard/compare/v0.16.0...v0.17.0) (2026-10-27)


### Features

* **canvas:** resize a placed shape by dragging its corner marks ([#152](https://github.com/erclx/frameboard/issues/152)) ([c5745bf](https://github.com/erclx/frameboard/commit/c5745bf4ef191c4560aaf5e31a891a0d792f8441))
* **layers:** reorder an element among its siblings by row drag and key ([#155](https://github.com/erclx/frameboard/issues/155)) ([ce4d3ee](https://github.com/erclx/frameboard/commit/ce4d3ee3d27c1fd8e16b60543afa52fbf850ed5d))
* **live:** keep a frame's flip, unseen mark, and selection on rename ([#153](https://github.com/erclx/frameboard/issues/153)) ([64dcc1f](https://github.com/erclx/frameboard/commit/64dcc1f7fbf24c291a7b3f037d2bb293210b6a27))
* **tooling:** queue heavy test runs on a machine-wide lock ([#158](https://github.com/erclx/frameboard/issues/158)) ([ed88ddd](https://github.com/erclx/frameboard/commit/ed88ddd4ff232cc36af57a957c3c6dfe74316d9c))


### Bug Fixes

* **inspector:** keep the checked weight number clear of its check ([#161](https://github.com/erclx/frameboard/issues/161)) ([eea4f5f](https://github.com/erclx/frameboard/commit/eea4f5f9771e2f03e891674082f71c77ff62f983))
* **web:** lift landing text to 4.5:1 contrast in light and dark ([#156](https://github.com/erclx/frameboard/issues/156)) ([c148ccb](https://github.com/erclx/frameboard/commit/c148ccb9c24f9bd91c7595b684360be6b78ba68b))


### Performance Improvements

* **faces:** copy only the woff2 files a sheet references ([#151](https://github.com/erclx/frameboard/issues/151)) ([21fe020](https://github.com/erclx/frameboard/commit/21fe0204e1221705c55d0a1d92182e7a166e6165))

## [0.16.0](https://github.com/erclx/frameboard/compare/v0.15.0...v0.16.0) (2026-10-27)


### Features

* **canvas:** match label rename, reveal, and drag to a Figma user ([#149](https://github.com/erclx/frameboard/issues/149)) ([8672b8d](https://github.com/erclx/frameboard/commit/8672b8d0d36353154846b54e1bc4aa749bb81b54))
* **faces:** serve Inter and Source Serif 4 beside Geist ([#148](https://github.com/erclx/frameboard/issues/148)) ([191d8a8](https://github.com/erclx/frameboard/commit/191d8a82133c981366faf5d5b862cb8a4242a396))
* **inspector:** pick font family and named weight in typography ([#144](https://github.com/erclx/frameboard/issues/144)) ([2d9295b](https://github.com/erclx/frameboard/commit/2d9295be4419a37bbd235dc3e2e6afca9a510082))
* **live:** keep frame flips, unseen marks, and selection on a rename ([#141](https://github.com/erclx/frameboard/issues/141)) ([fb363f8](https://github.com/erclx/frameboard/commit/fb363f85d6bf77635c6cf6959ebb8cbe97750e60))


### Bug Fixes

* **history:** select the frame when an undo removes the selected element ([#146](https://github.com/erclx/frameboard/issues/146)) ([fcf8014](https://github.com/erclx/frameboard/commit/fcf80140c30fdc150aa59237f22da40e014e8026))
* **kit:** stop the tooltip fade and zoom under reduced motion ([#147](https://github.com/erclx/frameboard/issues/147)) ([00acfd2](https://github.com/erclx/frameboard/commit/00acfd205fa68218048a400e676517e75a9e4a04))
* **live:** measure every hugging frame placed or rewritten mid-measure ([#142](https://github.com/erclx/frameboard/issues/142)) ([889c86d](https://github.com/erclx/frameboard/commit/889c86d3172d8206b524248ed362c22a9ce6041b))
* **notes:** start a note card below the View only pill ([#143](https://github.com/erclx/frameboard/issues/143)) ([ff46f24](https://github.com/erclx/frameboard/commit/ff46f245b28bc624699481a40a5dc13c8c72ed15))

## [0.15.0](https://github.com/erclx/frameboard/compare/v0.14.0...v0.15.0) (2026-10-27)


### Features

* **board:** add device frame sizes and draw a frame by a drag ([#135](https://github.com/erclx/frameboard/issues/135)) ([7a7f69a](https://github.com/erclx/frameboard/commit/7a7f69a26db1cd9462101bd25db8a4221b59e2b2))
* **web:** add the landing page and deploy it to Cloudflare Pages ([#139](https://github.com/erclx/frameboard/issues/139)) ([419c193](https://github.com/erclx/frameboard/commit/419c193d958fc245dd69b7f542430db78c4e3501))


### Bug Fixes

* **checks:** count text running past its block as clipped ([#137](https://github.com/erclx/frameboard/issues/137)) ([82c365e](https://github.com/erclx/frameboard/commit/82c365ef853f80a49b5a0478a5e42ce2f3c19a41))
* **live:** measure and slot a frame written first and placed after ([#134](https://github.com/erclx/frameboard/issues/134)) ([3cd8a3b](https://github.com/erclx/frameboard/commit/3cd8a3b8f0bb151fdfaad8b4e72f1eac99f63713))

## [0.14.0](https://github.com/erclx/frameboard/compare/v0.13.0...v0.14.0) (2026-10-26)


### Features

* **board:** delete elements by hand and fix nine hand tool faults ([#131](https://github.com/erclx/frameboard/issues/131)) ([1b3edeb](https://github.com/erclx/frameboard/commit/1b3edeb00c2c1f0b2dda4115d21263abda04b274))
* **board:** keep frames live through page and project renames ([#128](https://github.com/erclx/frameboard/issues/128)) ([2bbc9f7](https://github.com/erclx/frameboard/commit/2bbc9f721ceec7ad086dd499daf38a376aa35616))
* **canvas:** move a placed element and size a shape by a drag ([#130](https://github.com/erclx/frameboard/issues/130)) ([6cf1521](https://github.com/erclx/frameboard/commit/6cf1521008f7151ed0054b7b353048ad47fd8535))
* **inspector:** add frame fill, line height, and letter spacing ([#127](https://github.com/erclx/frameboard/issues/127)) ([948184b](https://github.com/erclx/frameboard/commit/948184b9d7e257e1244ecdea9bf168c17a74144d))
* **notes:** let a note carry a pasted or dropped image ([#129](https://github.com/erclx/frameboard/issues/129)) ([f550ef7](https://github.com/erclx/frameboard/commit/f550ef7769efb7f8beb44ad67cd42957e116acc2))
* **notes:** scroll a long note thread inside the canvas ([#125](https://github.com/erclx/frameboard/issues/125)) ([92c0e6f](https://github.com/erclx/frameboard/commit/92c0e6f1f58c8dc40f3a20dcbec557e89690ea5d))
* **notes:** start a session from a sent note when nobody listens ([#122](https://github.com/erclx/frameboard/issues/122)) ([64deff8](https://github.com/erclx/frameboard/commit/64deff8a819ac0293e31acffdff68dd187564189))


### Bug Fixes

* **palette:** widen the home shortcuts column and keep rows on one line ([#120](https://github.com/erclx/frameboard/issues/120)) ([3743d69](https://github.com/erclx/frameboard/commit/3743d694a0cbdcff139f6e433c28bcb86b131843))

## [0.13.0](https://github.com/erclx/frameboard/compare/v0.12.0...v0.13.0) (2026-10-26)


### Features

* **board:** draw Layers glyphs by layout and lead the Hide UI pill home ([#114](https://github.com/erclx/frameboard/issues/114)) ([40752bd](https://github.com/erclx/frameboard/commit/40752bdc36735f394d7bc43069a09f31d632d7e9))
* **canvas:** fit an empty page's first frames the moment they arrive ([#113](https://github.com/erclx/frameboard/issues/113)) ([808f30c](https://github.com/erclx/frameboard/commit/808f30cd0210e4e8e06319b8196e9500dfb2f0b5))
* **guide:** open a new board on its guide and let Back re-pick the look ([#111](https://github.com/erclx/frameboard/issues/111)) ([3c096ff](https://github.com/erclx/frameboard/commit/3c096ff5c5c10553231ca95173aaf6d1df1af132))
* **inspector:** relabel element fields and widen their scrub targets ([#116](https://github.com/erclx/frameboard/issues/116)) ([39cf1ab](https://github.com/erclx/frameboard/commit/39cf1ab0b45eea0a0d8e0248b13a0eed832516cb))


### Bug Fixes

* **board:** widen the shapes caret to a 24px target ([#110](https://github.com/erclx/frameboard/issues/110)) ([f47ae5f](https://github.com/erclx/frameboard/commit/f47ae5f190e9b019fe129390a58adf24ac689561))
* **server:** hold the hug and lock tests under load ([#112](https://github.com/erclx/frameboard/issues/112)) ([fdc520d](https://github.com/erclx/frameboard/commit/fdc520d40b71b570e9afae04bccf37eb9a1653db))
* **styles:** lift the dark claim to #e8b4ff for 4.5:1 on its tint ([#117](https://github.com/erclx/frameboard/issues/117)) ([0e13a6a](https://github.com/erclx/frameboard/commit/0e13a6a7e682aa511f4d2806c964d78825ddf975))

## [0.12.0](https://github.com/erclx/frameboard/compare/v0.11.0...v0.12.0) (2026-10-25)


### Features

* **board:** answer the keys and clicks a design-tool user reaches for ([#106](https://github.com/erclx/frameboard/issues/106)) ([17504a1](https://github.com/erclx/frameboard/commit/17504a199352a63ef16aef1944f23a2223e975fb))
* **board:** place text and shapes into a frame and edit text in place ([#109](https://github.com/erclx/frameboard/issues/109)) ([fcbe55f](https://github.com/erclx/frameboard/commit/fcbe55f71b0e26a51d3696787043f5bea9600599))
* **board:** polish the palette, previews, swatches, Play, and home sort ([#107](https://github.com/erclx/frameboard/issues/107)) ([28d0019](https://github.com/erclx/frameboard/commit/28d0019455ca17fef3df98a485d321e7f524fd74))
* **canvas:** ease a wheel notch's pan and keep a touchpad one to one ([#102](https://github.com/erclx/frameboard/issues/102)) ([d4834c0](https://github.com/erclx/frameboard/commit/d4834c0cb6e922739ef919725dd1b9e48c3a20e1))
* **checks:** report HTML and CSS a browser recovers from silently ([#108](https://github.com/erclx/frameboard/issues/108)) ([dfa38f2](https://github.com/erclx/frameboard/commit/dfa38f222bec67aec0a4ea73fe9dc8e0c7b76d73))
* **edit:** land a queued hand edit past an agent's write ([#104](https://github.com/erclx/frameboard/issues/104)) ([ab5eb5c](https://github.com/erclx/frameboard/commit/ab5eb5cb3e9724670e0ac0673e91da40e6423a2d))


### Bug Fixes

* **board:** correct what an agent and the developer read while it works ([#101](https://github.com/erclx/frameboard/issues/101)) ([d257192](https://github.com/erclx/frameboard/commit/d257192672f2f59a662913c3ef1792b668d9648b))
* **board:** keep a gap under the Pages header, lift empty lines ([#103](https://github.com/erclx/frameboard/issues/103)) ([72ffb4f](https://github.com/erclx/frameboard/commit/72ffb4f18470c67c6afc1dc8ab09254a3f959ae4))

## [0.11.0](https://github.com/erclx/frameboard/compare/v0.10.0...v0.11.0) (2026-10-25)


### Features

* **board:** finish the chrome around frames and their labels ([#93](https://github.com/erclx/frameboard/issues/93)) ([53776e2](https://github.com/erclx/frameboard/commit/53776e2b6094149a912d03e0f15e4dd4b9fa5ac1))
* **board:** guide a new board's first page to its first frame ([#98](https://github.com/erclx/frameboard/issues/98)) ([7af4115](https://github.com/erclx/frameboard/commit/7af411553da0f086672b2d9198a5c47203cc50d4))
* **board:** preview a frame at another width without writing its box ([#97](https://github.com/erclx/frameboard/issues/97)) ([7f0bebb](https://github.com/erclx/frameboard/commit/7f0bebbc732a7f269f4e62e3c6c40acd425bb90a))
* **changes:** offer a shown frame rather than jump a busy board ([#96](https://github.com/erclx/frameboard/issues/96)) ([db53c5e](https://github.com/erclx/frameboard/commit/db53c5ef87c1f952727ccf8e83aa1beaf906d87f))
* **home:** sort projects and pin favorites above the rest ([#99](https://github.com/erclx/frameboard/issues/99)) ([3d0a423](https://github.com/erclx/frameboard/commit/3d0a42312268ce4f278c0aa97d6051676ef38624))

## [0.10.0](https://github.com/erclx/frameboard/compare/v0.9.0...v0.10.0) (2026-10-25)


### Features

* **changes:** compare a changed frame with its version before ([#89](https://github.com/erclx/frameboard/issues/89)) ([4c4d9c8](https://github.com/erclx/frameboard/commit/4c4d9c8194a0c7ab890caf48ea95a03a77a64220))
* **cli:** print an edit link from bun run preview ([#90](https://github.com/erclx/frameboard/issues/90)) ([4038b5f](https://github.com/erclx/frameboard/commit/4038b5f295eac4dd96320e114c140789833b0600))
* **cli:** refuse serve when the client is not built ([#88](https://github.com/erclx/frameboard/issues/88)) ([0186c00](https://github.com/erclx/frameboard/commit/0186c00f90e5130344fdf00a90ba49d5ca44ee5a))

## [0.9.0](https://github.com/erclx/frameboard/compare/v0.8.0...v0.9.0) (2026-10-25)


### Features

* **board:** add a single-key switch and move around by keyboard ([#84](https://github.com/erclx/frameboard/issues/84)) ([e6d6f09](https://github.com/erclx/frameboard/commit/e6d6f09ee797b70268cf2958a3cb4e224b47aec2))
* **board:** hug frames to their content and open their findings ([#85](https://github.com/erclx/frameboard/issues/85)) ([11c6b6a](https://github.com/erclx/frameboard/commit/11c6b6a57066dc32d80c9db87f1d7a8e30d2acd0))
* **inspector:** rebuild the hand controls around a color picker ([#82](https://github.com/erclx/frameboard/issues/82)) ([3813111](https://github.com/erclx/frameboard/commit/38131111045ac0bbd898916d9ec509e30e949a07))

## [0.8.0](https://github.com/erclx/frameboard/compare/v0.7.0...v0.8.0) (2026-10-25)


### Features

* **access:** start boards where serve runs and add a writing-tab verb ([#77](https://github.com/erclx/frameboard/issues/77)) ([4360528](https://github.com/erclx/frameboard/commit/4360528b7515e488b43751a689505940a4dc0929))
* **undo:** undo a hand edit by its element, not its whole file ([#79](https://github.com/erclx/frameboard/issues/79)) ([9482735](https://github.com/erclx/frameboard/commit/9482735b4f173ae11dabff8fbda25f4b10360634))


### Bug Fixes

* **actions:** run board keys while a toast has focus ([#76](https://github.com/erclx/frameboard/issues/76)) ([36c800e](https://github.com/erclx/frameboard/commit/36c800e711e95f6c907e9012b0dd64eb0671495d))
* **cli:** load bundled faces when the CLI runs from source ([#81](https://github.com/erclx/frameboard/issues/81)) ([188ad99](https://github.com/erclx/frameboard/commit/188ad99818e06d9482e0c1532a16765dd6efe0e9))

## [0.7.0](https://github.com/erclx/frameboard/compare/v0.6.0...v0.7.0) (2026-10-25)


### Features

* **design-sync:** move the design references onto a frameboard board ([#73](https://github.com/erclx/frameboard/issues/73)) ([4df6b4f](https://github.com/erclx/frameboard/commit/4df6b4ff782deefbcc42a4f75fb172c7fe3a9a46))
* **labels:** declare the pull request label map ([#68](https://github.com/erclx/frameboard/issues/68)) ([f460b17](https://github.com/erclx/frameboard/commit/f460b17c3acaa3d9cb1c5adfc38e9e90677a68de))


### Bug Fixes

* **inspector:** ignore a browser undo reaching an unfocused field ([#74](https://github.com/erclx/frameboard/issues/74)) ([87b6bb2](https://github.com/erclx/frameboard/commit/87b6bb20950fd23c77d56daa2bf5dfac203840ce))

## [0.6.0](https://github.com/erclx/frameboard/compare/v0.5.0...v0.6.0) (2026-10-20)


### Features

* **follow:** pan the board to each frame a followed agent works on ([#58](https://github.com/erclx/frameboard/issues/58)) ([017a93a](https://github.com/erclx/frameboard/commit/017a93ad1fb74a15b47077b460ced871e79e6bfc))
* **home:** show frame captures as project thumbnails ([#59](https://github.com/erclx/frameboard/issues/59)) ([2a1e259](https://github.com/erclx/frameboard/commit/2a1e259e5da8bc4ddedb166ada4b79dc0cb77ea7))
* **menus:** open right-click menus on the board, with copy toasts ([#62](https://github.com/erclx/frameboard/issues/62)) ([71ca209](https://github.com/erclx/frameboard/commit/71ca2094a4517d281e79da18849221c95697e097))

## [0.5.0](https://github.com/erclx/frameboard/compare/v0.4.0...v0.5.0) (2026-10-20)


### Features

* **claims:** hold a hand edit on a claimed frame until the claim ends ([#51](https://github.com/erclx/frameboard/issues/51)) ([10c10da](https://github.com/erclx/frameboard/commit/10c10dae9dfac694b09d11244545cb1bf3cac3b6))
* **find:** find frames, elements, and copy across a project on Cmd+F ([#50](https://github.com/erclx/frameboard/issues/50)) ([15bf41e](https://github.com/erclx/frameboard/commit/15bf41e3e6b9f8c03980ac7bdec1216251dac2eb))


### Bug Fixes

* **claims:** dock waiting cards above the toolbar's row ([#57](https://github.com/erclx/frameboard/issues/57)) ([ecf21c4](https://github.com/erclx/frameboard/commit/ecf21c4c3cb95e40462b7c8cf978ae5548b75363))
* **fit:** skip content a cropping ancestor hides when sizing a frame ([#53](https://github.com/erclx/frameboard/issues/53)) ([e51149c](https://github.com/erclx/frameboard/commit/e51149c1a3dcec87766106e2d600f12afbccd281))
* **palette:** stop the enabled-action test racing the dialog fade ([#54](https://github.com/erclx/frameboard/issues/54)) ([e5d9b00](https://github.com/erclx/frameboard/commit/e5d9b00a80bc0fd095a4c959afe5c6e54e67325c))
* **test:** give browser tests budgets for a loaded machine ([#56](https://github.com/erclx/frameboard/issues/56)) ([1eecf92](https://github.com/erclx/frameboard/commit/1eecf921b6be980e01e9ddb0934baec5739ae745))

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
