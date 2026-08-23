/* ============================================================
   incense.js
   ROOMS WITHIN - ALTAR / INCENSE RITUAL

   Includes:
   - Grab incense
   - Hold tip near flame for ~0.7 sec to light
   - Incense smoke
   - Bow 3 times
   - Place incense into bat huong
   - Offering blackout

   Separate altar smoke:
   - NO automatic proximity activation
   - Desktop click / Quest right trigger once
   - Small interaction prompt near reticle
   - Prompt works with Quest controller ray
   - Smoke burns for 60 seconds
   - Cannot be restarted
   - Manual smoke X / Y / Z position
   - Larger smoke
============================================================ */


/* ============================================================
   HELPERS
============================================================ */

function ritualIsImmersiveXR(scene) {
  return Boolean(
    scene &&
    scene.renderer &&
    scene.renderer.xr &&
    scene.renderer.xr.isPresenting
  );
}


function ritualGameplayLocked() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );
}


function ritualUseReducedEffects() {
  const ua =
    String(
      navigator.userAgent || ''
    ).toLowerCase();

  return (
    ua.includes(
      'oculusbrowser'
    ) ||
    ua.includes(
      'quest'
    ) ||
    ua.includes(
      'android'
    )
  );
}


function ritualWait(ms) {

  if (
    window.waitRoomsMilliseconds
  ) {
    return window
      .waitRoomsMilliseconds(
        ms
      );
  }


  return new Promise(
    (resolve) => {

      let remaining =
        Math.max(
          0,
          Number(ms) || 0
        );


      let previous =
        performance.now();


      function step(now) {

        const elapsed =
          Math.max(
            0,
            now - previous
          );


        previous =
          now;


        if (
          !window.roomsPaused &&
          !window.roomsInputLocked
        ) {
          remaining -=
            elapsed;
        }


        if (
          remaining <= 0
        ) {
          resolve();

          return;
        }


        requestAnimationFrame(
          step
        );
      }


      requestAnimationFrame(
        step
      );
    }
  );
}


function ritualNormalizeName(
  value
) {

  return String(
    value || ''
  )

    .normalize(
      'NFD'
    )

    .replace(
      /[\u0300-\u036f]/g,
      ''
    )

    .toLowerCase()

    .replace(
      /[\s_\-]+/g,
      ''
    );
}


function ritualFindNamedObject(
  root,
  keywords
) {

  if (!root) {
    return null;
  }


  const wanted =
    keywords.map(
      ritualNormalizeName
    );


  let result =
    null;


  root.traverse(
    (node) => {

      if (result) {
        return;
      }


      const names = [
        node.name || ''
      ];


      if (
        node.material
      ) {

        const materials =
          Array.isArray(
            node.material
          )

            ? node.material

            : [
                node.material
              ];


        materials.forEach(
          (material) => {

            if (
              material &&
              material.name
            ) {

              names.push(
                material.name
              );
            }
          }
        );
      }


      const combined =
        ritualNormalizeName(
          names.join(
            ' '
          )
        );


      if (
        wanted.some(
          (keyword) =>
            combined.includes(
              keyword
            )
        )
      ) {
        result =
          node;
      }
    }
  );


  return result;
}


function ritualWorldBox(
  object
) {

  if (!object) {
    return null;
  }


  object.updateMatrixWorld(
    true
  );


  const box =
    new THREE.Box3()
      .setFromObject(
        object
      );


  return box.isEmpty()

    ? null

    : box;
}


function ritualWorldCenter(
  object
) {

  const box =
    ritualWorldBox(
      object
    );


  return box

    ? box.getCenter(
        new THREE.Vector3()
      )

    : null;
}


function ritualSetWorldPosition(
  entity,
  worldPosition
) {

  if (
    !entity ||
    !worldPosition
  ) {
    return;
  }


  const parent =
    entity.object3D.parent;


  if (!parent) {

    entity.object3D
      .position
      .copy(
        worldPosition
      );

    return;
  }


  parent.updateMatrixWorld(
    true
  );


  const local =
    parent.worldToLocal(
      worldPosition.clone()
    );


  entity.object3D
    .position
    .copy(
      local
    );
}


function ritualAppendRaycasterSelector(
  entity,
  selector
) {

  if (
    !entity ||
    !selector
  ) {
    return;
  }


  const data =
    entity.getAttribute(
      'raycaster'
    ) ||
    {};


  const selectors =
    String(
      data.objects ||
      ''
    )

      .split(
        ','
      )

      .map(
        (value) =>
          value.trim()
      )

      .filter(
        Boolean
      );


  if (
    !selectors.includes(
      selector
    )
  ) {

    selectors.push(
      selector
    );
  }


  entity.setAttribute(
    'raycaster',
    'objects',
    selectors.join(
      ', '
    )
  );


  const raycaster =
    entity.components &&
    entity.components
      .raycaster;


  if (
    raycaster &&
    raycaster.refreshObjects
  ) {

    raycaster
      .refreshObjects();
  }
}


/* ============================================================
   INCENSE SMOKE
============================================================ */

AFRAME.registerComponent(
  'incense-smoke',
  {

    schema: {

      active: {
        default:
          false
      },


      count: {
        default:
          18
      },


      height: {
        default:
          1.15
      },


      speed: {
        default:
          0.14
      },


      width: {
        default:
          0.11
      },


      opacity: {
        default:
          0.22
      },


      size: {
        default:
          0.045
      },


      color: {
        default:
          '#d0d0d0'
      }
    },


    init: function () {

      this.puffs =
        [];


      this.tipWorld =
        new THREE.Vector3();


      this.sceneObject =
        this.el.sceneEl
          .object3D;


      this.isRoomsPaused =
        false;


      this.smokeTexture =
        this.createSmokeTexture();


      this.onRoomsPauseChanged =
        (event) => {

          this.isRoomsPaused =
            Boolean(
              event &&
              event.detail &&
              event.detail.paused
            );
        };


      this.el.sceneEl
        .addEventListener(
          'rooms-pause-changed',
          this.onRoomsPauseChanged
        );


      this.createPuffs();
    },


    createSmokeTexture:
      function () {

        const canvas =
          document.createElement(
            'canvas'
          );


        canvas.width =
          128;

        canvas.height =
          128;


        const context =
          canvas.getContext(
            '2d'
          );


        const gradient =
          context
            .createRadialGradient(

              64,
              64,
              2,

              64,
              64,
              61
            );


        gradient.addColorStop(
          0,
          'rgba(240,240,240,0.82)'
        );


        gradient.addColorStop(
          0.18,
          'rgba(225,225,225,0.62)'
        );


        gradient.addColorStop(
          0.42,
          'rgba(205,205,205,0.34)'
        );


        gradient.addColorStop(
          0.72,
          'rgba(180,180,180,0.12)'
        );


        gradient.addColorStop(
          1,
          'rgba(160,160,160,0)'
        );


        context.fillStyle =
          gradient;


        context.fillRect(
          0,
          0,
          128,
          128
        );


        const texture =
          new THREE.CanvasTexture(
            canvas
          );


        texture.needsUpdate =
          true;


        return texture;
      },


    createPuffs:
      function () {

        const requested =
          Math.max(

            1,

            Math.floor(
              this.data.count
            )
          );


        /*
          Quest gets slightly fewer
          transparent sprites for performance.
        */

        const maximum =
          ritualUseReducedEffects()

            ? 14

            : 24;


        const actual =
          Math.min(
            requested,
            maximum
          );


        for (
          let i = 0;
          i < actual;
          i++
        ) {

          const material =
            new THREE
              .SpriteMaterial({

                map:
                  this.smokeTexture,


                color:
                  new THREE.Color(
                    this.data.color
                  ),


                transparent:
                  true,


                opacity:
                  0,


                depthWrite:
                  false,


                depthTest:
                  true
              });


          const sprite =
            new THREE.Sprite(
              material
            );


          sprite.visible =
            false;


          sprite.renderOrder =
            20;


          this.sceneObject
            .add(
              sprite
            );


          this.puffs.push({

            sprite,

            material,


            life:
              -(
                i /
                Math.max(
                  actual,
                  1
                )
              ),


            phase:
              Math.random() *
              Math.PI *
              2,


            driftX:
              (
                Math.random() -
                0.5
              ) *
              2,


            driftZ:
              (
                Math.random() -
                0.5
              ) *
              2,


            sizeSeed:
              0.72 +
              Math.random() *
              0.58,


            rotationSpeed:
              (
                Math.random() -
                0.5
              ) *
              0.34,


            opacitySeed:
              0.82 +
              Math.random() *
              0.25
          });
        }
      },


    update:
      function (
        oldData
      ) {

        if (
          !this.data.active
        ) {

          this.hideAllPuffs();
        }


        if (
          oldData &&
          oldData.color &&
          oldData.color !==
            this.data.color
        ) {

          const color =
            new THREE.Color(
              this.data.color
            );


          this.puffs
            .forEach(
              (puff) => {

                puff.material
                  .color
                  .copy(
                    color
                  );
              }
            );
        }
      },


    hideAllPuffs:
      function () {

        this.puffs
          .forEach(
            (puff) => {

              puff.sprite.visible =
                false;


              puff.material.opacity =
                0;
            }
          );
      },


    resetPuff:
      function (
        puff
      ) {

        puff.life =
          0;


        puff.phase =
          Math.random() *
          Math.PI *
          2;


        puff.driftX =
          (
            Math.random() -
            0.5
          ) *
          2;


        puff.driftZ =
          (
            Math.random() -
            0.5
          ) *
          2;


        puff.sizeSeed =
          0.72 +
          Math.random() *
          0.58;


        puff.rotationSpeed =
          (
            Math.random() -
            0.5
          ) *
          0.34;


        puff.opacitySeed =
          0.82 +
          Math.random() *
          0.25;
      },


    restartPuffs:
      function () {

        this.puffs
          .forEach(
            (
              puff,
              index
            ) => {

              this.resetPuff(
                puff
              );


              if (
                index === 0
              ) {

                puff.life =
                  0.11;
              }

              else if (
                index === 1
              ) {

                puff.life =
                  0.075;
              }

              else if (
                index === 2
              ) {

                puff.life =
                  0.04;
              }

              else {

                puff.life =
                  -(
                    (
                      (
                        index -
                        2
                      ) /

                      Math.max(
                        this.puffs.length,
                        1
                      )
                    ) *

                    0.55
                  );
              }
            }
          );
      },


    tick:
      function (
        time,
        deltaTime
      ) {

        if (
          !this.data.active ||
          !deltaTime ||
          this.isRoomsPaused
        ) {
          return;
        }


        this.el.object3D
          .getWorldPosition(
            this.tipWorld
          );


        const dt =
          Math.min(
            deltaTime /
            1000,
            0.05
          );


        const t =
          time *
          0.001;


        this.puffs
          .forEach(
            (puff) => {

              puff.life +=
                dt *
                this.data.speed *
                1.35;


              if (
                puff.life >
                1
              ) {

                this.resetPuff(
                  puff
                );
              }


              if (
                puff.life <
                0
              ) {

                puff.sprite.visible =
                  false;

                return;
              }


              const life =
                puff.life;


              const y =
                life *
                this.data.height;


              const lowerAmount =
                THREE.MathUtils
                  .clamp(

                    life /
                    0.28,

                    0,
                    1
                  );


              const middleAmount =
                THREE.MathUtils
                  .smoothstep(

                    life,

                    0.20,
                    0.72
                  );


              const upperAmount =
                THREE.MathUtils
                  .smoothstep(

                    life,

                    0.58,
                    1
                  );


              const lowerX =

                Math.sin(
                  t *
                  0.65 +
                  puff.phase
                ) *

                this.data.width *

                0.035 *

                lowerAmount;


              const lowerZ =

                Math.cos(
                  t *
                  0.55 +
                  puff.phase *
                  1.2
                ) *

                this.data.width *

                0.025 *

                lowerAmount;


              const curlX =

                Math.sin(
                  t *
                  0.95 +
                  life *
                  8.6 +
                  puff.phase
                ) *

                this.data.width *

                0.52 *

                middleAmount;


              const curlZ =

                Math.cos(
                  t *
                  0.78 +
                  life *
                  7.1 +
                  puff.phase *
                  1.35
                ) *

                this.data.width *

                0.36 *

                middleAmount;


              const driftX =

                puff.driftX *

                this.data.width *

                0.42 *

                upperAmount;


              const driftZ =

                puff.driftZ *

                this.data.width *

                0.34 *

                upperAmount;


              const turbulenceX =

                Math.sin(
                  t *
                  1.55 +
                  life *
                  14.5 +
                  puff.phase *
                  1.8
                ) *

                this.data.width *

                0.18 *

                upperAmount;


              const turbulenceZ =

                Math.cos(
                  t *
                  1.35 +
                  life *
                  12.4 +
                  puff.phase *
                  1.15
                ) *

                this.data.width *

                0.15 *

                upperAmount;


              puff.sprite.position
                .set(

                  this.tipWorld.x +
                  lowerX +
                  curlX +
                  driftX +
                  turbulenceX,


                  this.tipWorld.y +
                  y,


                  this.tipWorld.z +
                  lowerZ +
                  curlZ +
                  driftZ +
                  turbulenceZ
                );


              const baseScale =
                this.data.size *
                puff.sizeSeed;


              const expansion =
                0.56 +
                life *
                2.65;


              const puffWidth =
                baseScale *
                expansion;


              puff.sprite.scale
                .set(

                  puffWidth,


                  puffWidth *
                  (
                    1.28 +
                    upperAmount *
                    0.24
                  ),


                  1
                );


              puff.material.rotation =
                puff.phase +
                t *
                puff.rotationSpeed;


              const fadeIn =
                THREE.MathUtils
                  .smoothstep(

                    life,

                    0,
                    0.075
                  );


              const fadeOut =

                1 -

                THREE.MathUtils
                  .smoothstep(

                    life,

                    0.60,
                    1
                  );


              const irregularity =

                puff.opacitySeed *

                (
                  0.90 +

                  Math.sin(
                    t *
                    0.9 +
                    puff.phase
                  ) *

                  0.10
                );


              puff.material.opacity =

                this.data.opacity *

                fadeIn *

                fadeOut *

                irregularity;


              puff.sprite.visible =

                puff.material.opacity >
                0.002;
            }
          );
      },


    remove:
      function () {

        this.el.sceneEl
          .removeEventListener(
            'rooms-pause-changed',
            this.onRoomsPauseChanged
          );


        this.puffs
          .forEach(
            (puff) => {

              this.sceneObject
                .remove(
                  puff.sprite
                );


              puff.material
                .dispose();
            }
          );


        if (
          this.smokeTexture
        ) {

          this.smokeTexture
            .dispose();
        }


        this.puffs =
          [];
      }
  }
);


/* ============================================================
   OFFERING LAYOUT
============================================================ */

AFRAME.registerComponent(
  'offering-layout',
  {

    schema: {

      altar: {
        type:
          'selector'
      },


      surfaceRatio: {
        default:
          0.62
      },


      pickupSide: {
        default:
          -0.28
      },


      flameSide: {
        default:
          0.28
      },


      frontOffset: {
        default:
          0
      },


      temporaryFlame: {
        default:
          true
      },


      debugVisible: {
        default:
          false
      }
    },


    init:
      function () {

        this.applyLayout =
          this.applyLayout
            .bind(
              this
            );


        const altar =
          this.data.altar;


        if (!altar) {

          console.warn(
            'Offering layout: #bantho was not found.'
          );

          return;
        }


        altar.addEventListener(
          'model-loaded',
          this.applyLayout
        );


        if (
          altar.getObject3D(
            'mesh'
          )
        ) {

          this.applyLayout();
        }
      },


    applyLayout:
      function () {

        const altar =
          this.data.altar;


        const root =
          altar

            ? altar
                .getObject3D(
                  'mesh'
                )

            : null;


        if (!root) {
          return;
        }


        const altarBox =
          ritualWorldBox(
            root
          );


        if (!altarBox) {
          return;
        }


        const size =
          altarBox.getSize(
            new THREE.Vector3()
          );


        const center =
          altarBox.getCenter(
            new THREE.Vector3()
          );


        const bowlObject =
          ritualFindNamedObject(
            root,
            [

              'bat huong',

              'bathuong',

              'incense bowl',

              'incense burner',

              'censer',

              'urn'
            ]
          );


        const flameObject =
          ritualFindNamedObject(
            root,
            [

              'candle',

              'nen',

              'lamp',

              'den dau',

              'oil lamp',

              'flame',

              'lua'
            ]
          );


        const surfaceY =

          altarBox.min.y +

          size.y *

          this.data
            .surfaceRatio;


        let bowlPosition;


        if (
          bowlObject
        ) {

          const bowlBox =
            ritualWorldBox(
              bowlObject
            );


          bowlPosition =

            bowlBox

              ? new THREE.Vector3(

                  (
                    bowlBox.min.x +
                    bowlBox.max.x
                  ) *
                  0.5,


                  bowlBox.max.y +
                  0.015,


                  (
                    bowlBox.min.z +
                    bowlBox.max.z
                  ) *
                  0.5
                )


              : ritualWorldCenter(
                  bowlObject
                );
        }

        else {

          bowlPosition =
            new THREE.Vector3(

              center.x,


              surfaceY +
              0.035,


              center.z +
              this.data
                .frontOffset
            );
        }


        let flamePosition;


        if (
          flameObject
        ) {

          const flameBox =
            ritualWorldBox(
              flameObject
            );


          flamePosition =

            flameBox

              ? new THREE.Vector3(

                  (
                    flameBox.min.x +
                    flameBox.max.x
                  ) *
                  0.5,


                  flameBox.max.y +
                  0.025,


                  (
                    flameBox.min.z +
                    flameBox.max.z
                  ) *
                  0.5
                )


              : ritualWorldCenter(
                  flameObject
                );
        }

        else {

          flamePosition =
            new THREE.Vector3(

              center.x +

              size.x *

              this.data
                .flameSide,


              surfaceY +
              0.12,


              center.z +

              this.data
                .frontOffset
            );
        }


        const pickupPosition =
          new THREE.Vector3(

            center.x +

            size.x *

            this.data
              .pickupSide,


            surfaceY +
            0.055,


            center.z +

            this.data
              .frontOffset
          );


        const bowlZone =
          document.querySelector(
            '#incenseBowlZone'
          );


        const placedPoint =
          document.querySelector(
            '#incensePlacedPoint'
          );


        const flameZone =
          document.querySelector(
            '#incenseFlameZone'
          );


        const flameVisual =
          document.querySelector(
            '#incenseFlameVisual'
          );


        const incense =
          document.querySelector(
            '#incenseStick'
          );


        ritualSetWorldPosition(
          bowlZone,
          bowlPosition
        );


        ritualSetWorldPosition(

          placedPoint,

          bowlPosition
            .clone()
            .add(
              new THREE.Vector3(
                0,
                0.19,
                0
              )
            )
        );


        ritualSetWorldPosition(
          flameZone,
          flamePosition
        );


        ritualSetWorldPosition(
          flameVisual,
          flamePosition
        );


        ritualSetWorldPosition(
          incense,
          pickupPosition
        );


        if (
          incense &&
          incense.is &&
          !incense.is(
            'grabbed'
          )
        ) {

          incense.object3D
            .rotation
            .set(

              0,
              0,

              THREE.MathUtils
                .degToRad(
                  90
                )
            );
        }


        if (
          flameVisual
        ) {

          flameVisual
            .setAttribute(

              'visible',

              Boolean(

                this.data
                  .temporaryFlame &&

                !flameObject
              )
            );
        }


        const debugVisible =
          Boolean(
            this.data
              .debugVisible
          );


        if (
          bowlZone
        ) {

          bowlZone
            .setAttribute(

              'material',

              `color: #00ff88; opacity: ${
                debugVisible
                  ? 0.25
                  : 0
              }; transparent: true; depthWrite: false`
            );
        }


        if (
          flameZone
        ) {

          flameZone
            .setAttribute(

              'material',

              `color: #ff7b00; opacity: ${
                debugVisible
                  ? 0.25
                  : 0
              }; transparent: true; depthWrite: false`
            );
        }
      },


    remove:
      function () {

        if (
          this.data.altar
        ) {

          this.data.altar
            .removeEventListener(
              'model-loaded',
              this.applyLayout
            );
        }
      }
  }
);


/* ============================================================
   INCENSE OFFERING INTERACTION
============================================================ */

AFRAME.registerComponent(
  'incense-offering',
  {

    schema: {

      tip: {
        type:
          'selector'
      },


      base: {
        type:
          'selector'
      },


      flameZone: {
        type:
          'selector'
      },


      bowlZone: {
        type:
          'selector'
      },


      placedPoint: {
        type:
          'selector'
      },


      ember: {
        type:
          'selector'
      },


      tipFlame: {
        type:
          'selector'
      },


      requiredBows: {
        default:
          3
      },


      lightDistance: {
        default:
          0.11
      },


      lightHoldTime: {
        default:
          700
      },


      placeDistance: {
        default:
          0.13
      },


      bowDownAngle: {
        default:
          28
      },


      bowUpAngle: {
        default:
          12
      },


      bowCooldown: {
        default:
          450
      }
    },


    init:
      function () {

        this.state =
          'unlit';


        this.bowCount =
          0;


        this.lightProgress =
          0;


        this.bowWasDown =
          false;


        this.lastBowTime =
          0;


        this.completed =
          false;


        this.warnedPlacementEarly =
          false;


        this.removed =
          false;


        this.tipWorld =
          new THREE.Vector3();


        this.baseWorld =
          new THREE.Vector3();


        this.flameWorld =
          new THREE.Vector3();


        this.bowlWorld =
          new THREE.Vector3();


        this.headQuat =
          new THREE.Quaternion();


        this.forward =
          new THREE.Vector3();


        this.onKeyDown =
          this.onKeyDown
            .bind(
              this
            );


        window.addEventListener(
          'keydown',
          this.onKeyDown
        );


        if (
          this.data.ember
        ) {

          this.data.ember
            .setAttribute(
              'visible',
              false
            );
        }


        if (
          this.data.tipFlame
        ) {

          this.data.tipFlame
            .setAttribute(
              'visible',
              false
            );
        }


        if (
          this.data.tip
        ) {

          this.data.tip
            .setAttribute(
              'incense-smoke',
              'active',
              false
            );
        }


        console.log(
          'Incense ritual ready: pick up → light → bow 3x → place in bat huong.'
        );
      },


    isHeld:
      function () {

        return Boolean(

          this.el.is &&

          this.el.is(
            'grabbed'
          )
        );
      },


    isLit:
      function () {

        return (

          this.state ===
            'lit' ||

          this.state ===
            'placed'
        );
      },


    onKeyDown:
      function (
        event
      ) {

        if (
          ritualGameplayLocked()
        ) {
          return;
        }


        if (

          String(
            event.key || ''
          ).toLowerCase() ===
            'b' &&


          !ritualIsImmersiveXR(
            this.el.sceneEl
          ) &&


          this.isLit() &&


          this.isHeld() &&


          !this.completed
        ) {

          this.registerBow();
        }
      },


    getHeadDownAngle:
      function () {

        const camera =
          document.querySelector(
            '#cam'
          );


        if (!camera) {
          return 0;
        }


        camera.object3D
          .getWorldQuaternion(
            this.headQuat
          );


        this.forward

          .set(
            0,
            0,
            -1
          )

          .applyQuaternion(
            this.headQuat
          )

          .normalize();


        return THREE.MathUtils
          .radToDeg(

            Math.asin(

              THREE.MathUtils
                .clamp(

                  -this.forward.y,

                  -1,

                  1
                )
            )
          );
      },


    registerBow:
      function () {

        if (
          ritualGameplayLocked()
        ) {
          return;
        }


        const now =
          performance.now();


        if (
          now -
          this.lastBowTime <
          this.data
            .bowCooldown
        ) {
          return;
        }


        if (
          this.bowCount >=
          this.data
            .requiredBows
        ) {
          return;
        }


        this.lastBowTime =
          now;


        this.bowCount +=
          1;


        console.log(
          `Offering bow ${this.bowCount}/${this.data.requiredBows}`
        );


        this.el.emit(

          'offering-bow',

          {

            count:
              this.bowCount,


            total:
              this.data
                .requiredBows
          },

          false
        );


        if (
          this.bowCount >=
          this.data
            .requiredBows
        ) {

          console.log(
            'Offering: bowing complete. Place incense into bat huong.'
          );


          this.el.emit(
            'offering-bows-completed',
            {},
            false
          );
        }
      },


    updateBowDetection:
      function () {

        if (
          ritualGameplayLocked()
        ) {
          return;
        }


        if (

          !ritualIsImmersiveXR(
            this.el.sceneEl
          ) ||


          !this.isHeld() ||


          !this.isLit() ||


          this.completed ||


          this.bowCount >=
          this.data
            .requiredBows
        ) {
          return;
        }


        const angle =
          this.getHeadDownAngle();


        if (

          !this.bowWasDown &&

          angle >=
          this.data
            .bowDownAngle
        ) {

          this.bowWasDown =
            true;

          return;
        }


        if (

          this.bowWasDown &&

          angle <=
          this.data
            .bowUpAngle
        ) {

          this.bowWasDown =
            false;


          this.registerBow();
        }
      },


    lightIncense:
      function () {

        if (

          ritualGameplayLocked() ||

          this.state !==
            'unlit'
        ) {
          return;
        }


        this.state =
          'lit';


        this.lightProgress =
          0;


        if (
          this.data.ember
        ) {

          this.data.ember
            .setAttribute(
              'visible',
              true
            );
        }


        if (
          this.data.tipFlame
        ) {

          this.data.tipFlame
            .setAttribute(
              'visible',
              true
            );


          ritualWait(
            450
          ).then(
            () => {

              if (

                !this.removed &&

                this.data
                  .tipFlame
              ) {

                this.data
                  .tipFlame
                  .setAttribute(
                    'visible',
                    false
                  );
              }
            }
          );
        }


        if (
          this.data.tip
        ) {

          const smoke =
            this.data.tip
              .components[
                'incense-smoke'
              ];


          if (

            smoke &&

            smoke.restartPuffs
          ) {

            smoke.restartPuffs();
          }


          this.data.tip
            .setAttribute(

              'incense-smoke',

              'active',

              true
            );
        }


        this.el.emit(
          'incense-lit',
          {},
          false
        );


        console.log(
          'Incense lit. Bow three times while holding it.'
        );
      },


    updateLighting:
      function (
        deltaTime
      ) {

        if (
          ritualGameplayLocked()
        ) {

          this.lightProgress =
            0;

          return;
        }


        if (

          this.state !==
            'unlit' ||


          !this.isHeld() ||


          !this.data.tip ||


          !this.data
            .flameZone
        ) {

          this.lightProgress =
            0;

          return;
        }


        this.data.tip
          .object3D
          .getWorldPosition(
            this.tipWorld
          );


        this.data
          .flameZone
          .object3D
          .getWorldPosition(
            this.flameWorld
          );


        const distance =
          this.tipWorld
            .distanceTo(
              this.flameWorld
            );


        if (
          distance <=
          this.data
            .lightDistance
        ) {

          this.lightProgress +=
            deltaTime;


          if (
            this.lightProgress >=
            this.data
              .lightHoldTime
          ) {

            this.lightIncense();
          }
        }

        else {

          this.lightProgress =
            0;
        }
      },


    updatePlacement:
      function () {

        if (
          ritualGameplayLocked()
        ) {
          return;
        }


        if (

          !this.isLit() ||


          this.completed ||


          !this.isHeld() ||


          !this.data.base ||


          !this.data
            .bowlZone
        ) {
          return;
        }


        this.data.base
          .object3D
          .getWorldPosition(
            this.baseWorld
          );


        this.data
          .bowlZone
          .object3D
          .getWorldPosition(
            this.bowlWorld
          );


        const distance =
          this.baseWorld
            .distanceTo(
              this.bowlWorld
            );


        if (
          distance >
          this.data
            .placeDistance
        ) {

          this.warnedPlacementEarly =
            false;

          return;
        }


        if (
          this.bowCount <
          this.data
            .requiredBows
        ) {

          if (
            !this.warnedPlacementEarly
          ) {

            console.log(
              `Offering: ${this.bowCount}/${this.data.requiredBows} bows complete.`
            );


            this.warnedPlacementEarly =
              true;
          }


          return;
        }


        this.placeIncense();
      },


    detachFromCurrentHolder:
      function () {

        const grabbable =
          this.el.components[
            'natural-grabbable'
          ];


        if (!grabbable) {
          return;
        }


        const holder =
          grabbable.heldBy;


        if (
          holder &&
          holder.components
        ) {

          const hand =
            holder.components[
              'natural-grab-hand'
            ];


          if (

            hand &&

            hand.heldItem ===
              grabbable
          ) {

            hand.heldItem =
              null;


            hand.gripHeld =
              false;
          }
        }


        if (
          grabbable
            .reparentPreserveWorld
        ) {

          grabbable
            .reparentPreserveWorld(
              this.el.sceneEl
                .object3D
            );
        }

        else {

          this.el.sceneEl
            .object3D
            .attach(
              this.el.object3D
            );
        }


        grabbable.heldBy =
          null;


        grabbable.isMoving =
          false;


        if (
          grabbable.velocity
        ) {

          grabbable.velocity
            .set(
              0,
              0,
              0
            );
        }


        if (

          this.el.is &&

          this.el.is(
            'grabbed'
          )
        ) {

          this.el.removeState(
            'grabbed'
          );
        }
      },


    placeIncense:
      function () {

        if (

          ritualGameplayLocked() ||


          this.completed ||


          !this.data
            .placedPoint
        ) {
          return;
        }


        this.detachFromCurrentHolder();


        const worldPosition =
          new THREE.Vector3();


        const worldQuaternion =
          new THREE.Quaternion();


        this.data
          .placedPoint
          .object3D
          .getWorldPosition(
            worldPosition
          );


        this.data
          .placedPoint
          .object3D
          .getWorldQuaternion(
            worldQuaternion
          );


        this.el.object3D
          .position
          .copy(
            worldPosition
          );


        this.el.object3D
          .quaternion
          .copy(
            worldQuaternion
          );


        this.state =
          'placed';


        this.completed =
          true;


        this.el.classList
          .remove(
            'item'
          );


        this.el.classList
          .remove(
            'interactable'
          );


        this.el.removeAttribute(
          'natural-grabbable'
        );


        const detail = {

          bows:
            this.bowCount,


          requiredBows:
            this.data
              .requiredBows
        };


        this.el.emit(
          'offering-completed',
          detail,
          false
        );


        this.el.sceneEl.emit(
          'offering-completed',
          detail,
          false
        );


        const story =
          document.querySelector(
            '#story-manager'
          );


        if (
          story
        ) {

          story.emit(
            'offering-completed',
            detail,
            false
          );
        }


        console.log(
          'Offering completed. Incense placed in bat huong.'
        );
      },


    tick:
      function (
        time,
        deltaTime
      ) {

        if (

          ritualGameplayLocked() ||


          !deltaTime ||


          this.completed
        ) {
          return;
        }


        this.updateLighting(
          deltaTime
        );


        this.updateBowDetection();


        this.updatePlacement();
      },


    remove:
      function () {

        this.removed =
          true;


        window.removeEventListener(
          'keydown',
          this.onKeyDown
        );
      }
  }
);


/* ============================================================
   OFFERING BLACKOUT
============================================================ */

AFRAME.registerComponent(
  'offering-blackout',
  {

    schema: {

      delay: {
        default:
          1400
      },


      blackoutDuration: {
        default:
          1900
      }
    },


    init:
      function () {

        this.hasRun =
          false;


        this.lightStates =
          [];


        this.tvWasOn =
          false;


        this.tvComponent =
          null;


        this.onOfferingCompleted =
          this.onOfferingCompleted
            .bind(
              this
            );


        this.el.sceneEl
          .addEventListener(

            'offering-completed',

            this.onOfferingCompleted
          );
      },


    captureLights:
      function () {

        this.lightStates =
          [];


        this.el.sceneEl

          .querySelectorAll(
            '[light]'
          )

          .forEach(
            (entity) => {

              this.lightStates
                .push({

                  entity,


                  light:
                    Object.assign(

                      {},

                      entity
                        .getAttribute(
                          'light'
                        ) ||
                      {}
                    ),


                  hadFlicker:
                    entity
                      .hasAttribute(
                        'flicker'
                      ),


                  flicker:
                    entity
                      .hasAttribute(
                        'flicker'
                      )

                      ? Object.assign(

                          {},

                          entity
                            .getAttribute(
                              'flicker'
                            ) ||
                          {}
                        )

                      : null
                });
            }
          );
      },


    lightsOff:
      function () {

        this.lightStates
          .forEach(
            (state) => {

              if (
                state.entity
                  .hasAttribute(
                    'flicker'
                  )
              ) {

                state.entity
                  .removeAttribute(
                    'flicker'
                  );
              }


              state.entity
                .setAttribute(

                  'light',

                  'intensity',

                  0
                );
            }
          );
      },


    lightsOn:
      function () {

        this.lightStates
          .forEach(
            (state) => {

              if (
                !state.entity
                  .isConnected
              ) {
                return;
              }


              state.entity
                .setAttribute(
                  'light',
                  state.light
                );


              if (

                state.hadFlicker &&

                state.flicker
              ) {

                state.entity
                  .setAttribute(
                    'flicker',
                    state.flicker
                  );
              }
            }
          );
      },


    onOfferingCompleted:
      async function () {

        if (
          this.hasRun
        ) {
          return;
        }


        this.hasRun =
          true;


        await ritualWait(
          this.data.delay
        );


        this.captureLights();


        const living =
          document.querySelector(
            '#living'
          );


        this.tvComponent =

          living &&
          living.components

            ? living.components[
                'embedded-tv'
              ] ||
              null

            : null;


        this.tvWasOn =
          Boolean(

            this.tvComponent &&

            this.tvComponent
              .isOn
          );


        if (

          this.tvWasOn &&

          this.tvComponent &&

          this.tvComponent
            .setState
        ) {

          this.tvComponent
            .setState(
              false
            );
        }


        this.lightsOff();


        await ritualWait(
          90
        );


        this.lightsOn();


        await ritualWait(
          210
        );


        this.lightsOff();


        await ritualWait(
          70
        );


        this.lightsOn();


        await ritualWait(
          135
        );


        this.lightsOff();


        await ritualWait(
          130
        );


        this.lightsOn();


        await ritualWait(
          180
        );


        this.lightsOff();


        this.el.sceneEl.emit(

          'offering-blackout-started',

          {},

          false
        );


        await ritualWait(
          this.data
            .blackoutDuration
        );


        this.lightsOn();


        if (

          this.tvWasOn &&

          this.tvComponent &&

          this.tvComponent
            .setState
        ) {

          this.tvComponent
            .setState(
              true
            );
        }


        this.el.sceneEl.emit(

          'offering-blackout-finished',

          {},

          false
        );


        console.log(
          'Offering blackout finished.'
        );
      },


    remove:
      function () {

        this.el.sceneEl
          .removeEventListener(

            'offering-completed',

            this.onOfferingCompleted
          );
      }
  }
);


/* ============================================================
   ALTAR SMOKE INTERACTION

   IMPORTANT:

   smokeOffsetX = LEFT / RIGHT
   smokeOffsetY = UP / DOWN
   smokeOffsetZ = FORWARD / BACKWARD

   Current smoke is larger and moved inward.
============================================================ */

AFRAME.registerComponent(
  'temporary-offering-table-smoke',
  {

    schema: {

      /*
        One minute.
      */

      burnDuration: {
        default:
          60000
      },


      /*
        MANUAL SMOKE POSITION

        This is much easier to adjust
        than trying to guess an object
        inside bantho.glb.
      */

      smokeOffsetX: {
        default:
          -1.5
      },


      smokeOffsetY: {
        default:
          1.4
      },


      smokeOffsetZ: {
        default:
          -1
      },


      /*
        BIGGER ALTAR SMOKE
      */

      count: {
        default:
          24
      },


      height: {
        default:
          1.15
      },


      speed: {
        default:
          0.16
      },


      width: {
        default:
          0.20
      },


      opacity: {
        default:
          0.30
      },


      size: {
        default:
          0.085
      },


      color: {
        default:
          '#d4d4d4'
      },


      hitboxScale: {
        default:
          1.08
      },


      surfaceRatio: {
        default:
          0.62
      }
    },


    init:
      function () {

        this.smokeAnchor =
          null;


        this.hitbox =
          null;


        this.tooltipRoot =
          null;


        this.tooltipText =
          null;


        this.tooltipBackground =
          null;


        this.remainingMs =
          0;


        this.hasBeenLit =
          false;


        this.hasBurnedOut =
          false;


        this.altarBox =
          null;


        this.onModelLoaded =
          this.onModelLoaded
            .bind(
              this
            );


        this.onHitboxClick =
          this.onHitboxClick
            .bind(
              this
            );


        this.onMouseEnter =
          this.onMouseEnter
            .bind(
              this
            );


        this.onMouseLeave =
          this.onMouseLeave
            .bind(
              this
            );


        this.onRaycasterEnter =
          this.onRaycasterEnter
            .bind(
              this
            );


        this.onRaycasterLeave =
          this.onRaycasterLeave
            .bind(
              this
            );


        this.el.addEventListener(
          'model-loaded',
          this.onModelLoaded
        );


        this.createSmokeAnchor();


        this.createHitbox();


        this.createTooltip();


        if (
          this.el.getObject3D(
            'mesh'
          )
        ) {

          this.onModelLoaded();
        }
      },


    /* ======================================================
       CREATE ALTAR SMOKE
    ====================================================== */

    createSmokeAnchor:
      function () {

        if (
          this.smokeAnchor
        ) {
          return;
        }


        const anchor =
          document.createElement(
            'a-entity'
          );


        anchor.setAttribute(
          'id',
          'temporaryBanthoSmokeAnchor'
        );


        anchor.setAttribute(

          'incense-smoke',

          {

            active:
              false,


            count:
              this.data.count,


            height:
              this.data.height,


            speed:
              this.data.speed,


            width:
              this.data.width,


            opacity:
              this.data.opacity,


            size:
              this.data.size,


            color:
              this.data.color
          }
        );


        this.el.sceneEl
          .appendChild(
            anchor
          );


        this.smokeAnchor =
          anchor;
      },


    /* ======================================================
       INVISIBLE ALTAR CLICK AREA
    ====================================================== */

    createHitbox:
      function () {

        if (
          this.hitbox
        ) {
          return;
        }


        const hitbox =
          document.createElement(
            'a-box'
          );


        hitbox.setAttribute(
          'id',
          'temporaryBanthoHitbox'
        );


        hitbox.classList
          .add(
            'offering-smoke-hitbox'
          );


        hitbox.setAttribute(

          'material',

          'opacity: 0; transparent: true; depthWrite: false; side: double'
        );


        /*
          IMPORTANT:
          visible must stay true,
          otherwise raycasting cannot hit it.
        */

        hitbox.setAttribute(
          'visible',
          true
        );


        hitbox.addEventListener(
          'click',
          this.onHitboxClick
        );


        hitbox.addEventListener(
          'mouseenter',
          this.onMouseEnter
        );


        hitbox.addEventListener(
          'mouseleave',
          this.onMouseLeave
        );


        /*
          Quest controller ray.
        */

        hitbox.addEventListener(
          'raycaster-intersected',
          this.onRaycasterEnter
        );


        hitbox.addEventListener(
          'raycaster-intersected-cleared',
          this.onRaycasterLeave
        );


        this.el.sceneEl
          .appendChild(
            hitbox
          );


        this.hitbox =
          hitbox;
      },


    /* ======================================================
       SMALL "LIGHT UP THE INCENSE" TEXT
    ====================================================== */

    createTooltip:
      function () {

        if (
          this.tooltipRoot
        ) {
          return;
        }


        const camera =
          document.querySelector(
            '#cam'
          );


        if (!camera) {
          return;
        }


        const root =
          document.createElement(
            'a-entity'
          );


        root.setAttribute(
          'id',
          'incenseInteractionTooltip'
        );


        /*
          Near the centre reticle,
          slightly underneath it.
        */

        root.setAttribute(
          'position',
          '0 -0.065 -0.8'
        );


        root.setAttribute(
          'visible',
          false
        );


        /*
          Small transparent dark background.
        */

        const background =
          document.createElement(
            'a-plane'
          );


        background.setAttribute(
          'width',
          '0.29'
        );


        background.setAttribute(
          'height',
          '0.035'
        );


        background.setAttribute(
          'position',
          '0 0 -0.002'
        );


        background.setAttribute(

          'material',

          'shader: flat; color: #070707; opacity: 0.56; transparent: true; depthTest: false; depthWrite: false; side: double'
        );


        /*
          Prompt text.
        */

        const text =
          document.createElement(
            'a-text'
          );


        text.setAttribute(
          'value',
          'LIGHT UP THE INCENSE'
        );


        /*
          Cleaner game-like font.
        */

        text.setAttribute(
          'font',
          'exo2semibold'
        );


        text.setAttribute(
          'align',
          'center'
        );


        text.setAttribute(
          'anchor',
          'center'
        );


        text.setAttribute(
          'baseline',
          'center'
        );


        text.setAttribute(
          'color',
          '#f4f1e8'
        );


        /*
          MUCH smaller than the old giant text.
        */

        text.setAttribute(
          'width',
          '0.30'
        );


        text.setAttribute(
          'wrap-count',
          '25'
        );


        text.setAttribute(
          'position',
          '0 0 0'
        );


        text.setAttribute(

          'material',

          'shader: flat; depthTest: false; depthWrite: false'
        );


      


        root.appendChild(
          text
        );


        camera.appendChild(
          root
        );


        this.tooltipRoot =
          root;


        this.tooltipText =
          text;


        this.tooltipBackground =
          background;
      },


    /* ======================================================
       SHOW PROMPT
    ====================================================== */

    showTooltip:
      function () {

        if (

          !this.tooltipRoot ||


          this.hasBeenLit ||


          this.hasBurnedOut ||


          ritualGameplayLocked()
        ) {
          return;
        }


        this.tooltipRoot
          .setAttribute(
            'visible',
            true
          );
      },


    /* ======================================================
       HIDE PROMPT
    ====================================================== */

    hideTooltip:
      function () {

        if (
          !this.tooltipRoot
        ) {
          return;
        }


        this.tooltipRoot
          .setAttribute(
            'visible',
            false
          );
      },


    /* ======================================================
       DESKTOP CROSSHAIR
    ====================================================== */

    onMouseEnter:
      function () {

        if (
          ritualIsImmersiveXR(
            this.el.sceneEl
          )
        ) {
          return;
        }


        this.showTooltip();
      },


    onMouseLeave:
      function () {

        if (
          ritualIsImmersiveXR(
            this.el.sceneEl
          )
        ) {
          return;
        }


        this.hideTooltip();
      },


    /* ======================================================
       QUEST RIGHT CONTROLLER POINTING AT ALTAR
    ====================================================== */

    onRaycasterEnter:
      function (
        event
      ) {

        if (
          !ritualIsImmersiveXR(
            this.el.sceneEl
          )
        ) {
          return;
        }


        const rayEntity =

          event &&
          event.detail

            ? event.detail.el

            : null;


        /*
          Only show it for right controller.
        */

        if (

          !rayEntity ||

          rayEntity.id !==
            'rightHand'
        ) {
          return;
        }


        this.showTooltip();
      },


    onRaycasterLeave:
      function (
        event
      ) {

        if (
          !ritualIsImmersiveXR(
            this.el.sceneEl
          )
        ) {
          return;
        }


        const rayEntity =

          event &&
          event.detail

            ? event.detail.el

            : null;


        if (

          rayEntity &&

          rayEntity.id !==
            'rightHand'
        ) {
          return;
        }


        this.hideTooltip();
      },


    onModelLoaded:
      function () {

        this.updateInteractionLayout();
      },


    /* ======================================================
       ALTAR SMOKE POSITION

       NO automatic object guessing here.

       Start from the centre of bantho.glb
       and move using X / Y / Z offsets.

       X = left / right
       Y = up / down
       Z = forward / backward
    ====================================================== */

    updateInteractionLayout:
      function () {

        const root =
          this.el.getObject3D(
            'mesh'
          );


        if (

          !root ||

          !this.smokeAnchor ||

          !this.hitbox
        ) {
          return false;
        }


        const box =
          ritualWorldBox(
            root
          );


        if (!box) {
          return false;
        }


        this.altarBox =
          box.clone();


        const size =
          box.getSize(
            new THREE.Vector3()
          );


        const center =
          box.getCenter(
            new THREE.Vector3()
          );


        /*
          Estimate the top surface of
          the offering table.
        */

        const surfaceY =

          box.min.y +

          size.y *

          this.data
            .surfaceRatio;


        /*
          ACTUAL SMOKE LOCATION.

          Change only the 3 offset values
          in the schema if it needs moving.
        */

        const smokeWorld =
          new THREE.Vector3(

            center.x +
            this.data
              .smokeOffsetX,


            surfaceY +
            this.data
              .smokeOffsetY,


            center.z +
            this.data
              .smokeOffsetZ
          );


        ritualSetWorldPosition(

          this.smokeAnchor,

          smokeWorld
        );


        /*
          Clickable invisible box stays
          over the whole altar.
        */

        ritualSetWorldPosition(

          this.hitbox,

          center
        );


        this.hitbox
          .setAttribute(

            'width',

            Math.max(

              size.x *

              this.data
                .hitboxScale,

              0.55
            )
          );


        this.hitbox
          .setAttribute(

            'height',

            Math.max(

              size.y *

              this.data
                .hitboxScale,

              0.65
            )
          );


        this.hitbox
          .setAttribute(

            'depth',

            Math.max(

              size.z *

              this.data
                .hitboxScale,

              0.35
            )
          );


        const cursor =
          document.querySelector(
            'a-cursor'
          );


        const rightHand =
          document.querySelector(
            '#rightHand'
          );


        ritualAppendRaycasterSelector(

          cursor,

          '.offering-smoke-hitbox'
        );


        ritualAppendRaycasterSelector(

          rightHand,

          '.offering-smoke-hitbox'
        );


        if (

          rightHand &&

          !rightHand
            .hasAttribute(
              'vr-offering-table-smoke-interactor'
            )
        ) {

          rightHand
            .setAttribute(

              'vr-offering-table-smoke-interactor',

              ''
            );
        }


        return true;
      },


    /* ======================================================
       DESKTOP CLICK
    ====================================================== */

    onHitboxClick:
      function (
        event
      ) {

        if (

          ritualGameplayLocked() ||


          ritualIsImmersiveXR(
            this.el.sceneEl
          )
        ) {
          return;
        }


        if (
          event &&
          event.stopPropagation
        ) {

          event.stopPropagation();
        }


        this.lightAltarIncense();
      },


    /* ======================================================
       START ALTAR SMOKE

       ONE TIME ONLY.
       60 SECONDS.
    ====================================================== */

    lightAltarIncense:
      function () {

        if (

          ritualGameplayLocked() ||


          this.hasBeenLit ||


          this.hasBurnedOut
        ) {
          return false;
        }


        if (
          !this.updateInteractionLayout()
        ) {
          return false;
        }


        this.hasBeenLit =
          true;


        this.hideTooltip();


        const smoke =
          this.smokeAnchor
            .components[
              'incense-smoke'
            ];


        if (

          smoke &&

          smoke.restartPuffs
        ) {

          smoke.restartPuffs();
        }


        this.smokeAnchor
          .setAttribute(

            'incense-smoke',

            'active',

            true
          );


        this.remainingMs =
          this.data
            .burnDuration;


        const detail = {

          automatic:
            false,


          duration:
            this.data
              .burnDuration
        };


        this.el.emit(

          'temporary-offering-smoke',

          detail,

          false
        );


        this.el.sceneEl.emit(

          'temporary-offering-smoke',

          detail,

          false
        );


        console.log(
          'Altar incense lit. Smoke will burn for 60 seconds.'
        );


        return true;
      },


    /*
      Keep this because the Quest
      controller component calls
      triggerSmoke().
    */

    triggerSmoke:
      function () {

        return this
          .lightAltarIncense();
      },


    /* ======================================================
       BURN OUT AFTER ONE MINUTE
    ====================================================== */

    burnOut:
      function () {

        this.remainingMs =
          0;


        this.hasBurnedOut =
          true;


        if (
          this.smokeAnchor
        ) {

          this.smokeAnchor
            .setAttribute(

              'incense-smoke',

              'active',

              false
            );
        }


        this.hideTooltip();


        this.el.emit(

          'temporary-offering-smoke-finished',

          {},

          false
        );


        this.el.sceneEl.emit(

          'temporary-offering-smoke-finished',

          {},

          false
        );


        console.log(
          'Altar incense burned out.'
        );
      },


    /* ======================================================
       60 SECOND TIMER
    ====================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {

        if (

          ritualGameplayLocked() ||


          !deltaTime ||


          !this.hasBeenLit ||


          this.hasBurnedOut ||


          this.remainingMs <=
          0
        ) {
          return;
        }


        this.remainingMs -=
          deltaTime;


        if (
          this.remainingMs <=
          0
        ) {

          this.burnOut();
        }
      },


    /* ======================================================
       CLEANUP
    ====================================================== */

    remove:
      function () {

        this.el
          .removeEventListener(
            'model-loaded',
            this.onModelLoaded
          );


        if (
          this.hitbox
        ) {

          this.hitbox
            .removeEventListener(
              'click',
              this.onHitboxClick
            );


          this.hitbox
            .removeEventListener(
              'mouseenter',
              this.onMouseEnter
            );


          this.hitbox
            .removeEventListener(
              'mouseleave',
              this.onMouseLeave
            );


          this.hitbox
            .removeEventListener(
              'raycaster-intersected',
              this.onRaycasterEnter
            );


          this.hitbox
            .removeEventListener(
              'raycaster-intersected-cleared',
              this.onRaycasterLeave
            );


          if (
            this.hitbox
              .parentNode
          ) {

            this.hitbox
              .parentNode
              .removeChild(
                this.hitbox
              );
          }
        }


        if (

          this.smokeAnchor &&

          this.smokeAnchor
            .parentNode
        ) {

          this.smokeAnchor
            .parentNode
            .removeChild(
              this.smokeAnchor
            );
        }


        if (

          this.tooltipRoot &&

          this.tooltipRoot
            .parentNode
        ) {

          this.tooltipRoot
            .parentNode
            .removeChild(
              this.tooltipRoot
            );
        }


        this.hitbox =
          null;


        this.smokeAnchor =
          null;


        this.tooltipRoot =
          null;


        this.tooltipText =
          null;


        this.tooltipBackground =
          null;
      }
  }
);


/* ============================================================
   QUEST ALTAR INTERACTION
============================================================ */

AFRAME.registerComponent(
  'vr-offering-table-smoke-interactor',
  {

    schema: {

      pressThreshold: {
        default:
          0.65
      },


      releaseThreshold: {
        default:
          0.2
      }
    },


    init:
      function () {

        this.triggerHeld =
          false;


        this.pressTrigger =
          this.pressTrigger
            .bind(
              this
            );


        this.releaseTrigger =
          this.releaseTrigger
            .bind(
              this
            );


        this.onTriggerChanged =
          this.onTriggerChanged
            .bind(
              this
            );


        this.el.addEventListener(

          'triggerdown',

          this.pressTrigger
        );


        this.el.addEventListener(

          'triggerup',

          this.releaseTrigger
        );


        this.el.addEventListener(

          'triggerchanged',

          this.onTriggerChanged
        );


        this.el.addEventListener(

          'controllerdisconnected',

          this.releaseTrigger
        );
      },


    pressTrigger:
      function () {

        if (

          this.triggerHeld ||

          ritualGameplayLocked()
        ) {
          return;
        }


        this.triggerHeld =
          true;


        this.useOfferingTable();
      },


    releaseTrigger:
      function () {

        this.triggerHeld =
          false;
      },


    onTriggerChanged:
      function (
        event
      ) {

        const value =

          event &&

          event.detail &&

          typeof event
            .detail.value ===
            'number'

            ? event.detail.value

            : null;


        if (
          value ===
          null
        ) {
          return;
        }


        if (

          value >=
          this.data
            .pressThreshold &&


          !this.triggerHeld
        ) {

          this.pressTrigger();
        }

        else if (

          value <=
          this.data
            .releaseThreshold
        ) {

          this.releaseTrigger();
        }
      },


    useOfferingTable:
      function () {

        if (
          ritualGameplayLocked()
        ) {
          return false;
        }


        const bantho =
          document.querySelector(
            '#bantho'
          );


        const hitbox =
          document.querySelector(
            '#temporaryBanthoHitbox'
          );


        const raycaster =
          this.el.components
            .raycaster;


        if (

          !bantho ||

          !hitbox ||

          !raycaster
        ) {
          return false;
        }


        const component =
          bantho.components[
            'temporary-offering-table-smoke'
          ];


        if (
          !component
        ) {
          return false;
        }


        if (
          raycaster
            .refreshObjects
        ) {

          raycaster
            .refreshObjects();
        }


        const intersection =

          raycaster
            .getIntersection

            ? raycaster
                .getIntersection(
                  hitbox
                )

            : null;


        if (
          !intersection
        ) {
          return false;
        }


        return component
          .triggerSmoke();
      },


    remove:
      function () {

        this.el.removeEventListener(

          'triggerdown',

          this.pressTrigger
        );


        this.el.removeEventListener(

          'triggerup',

          this.releaseTrigger
        );


        this.el.removeEventListener(

          'triggerchanged',

          this.onTriggerChanged
        );


        this.el.removeEventListener(

          'controllerdisconnected',

          this.releaseTrigger
        );
      }
  }
);


/* ============================================================
   SETUP

   IMPORTANT:
   This only attaches the component.
   It DOES NOT automatically start smoke.
============================================================ */

function setupTemporaryOfferingTableSmoke() {

  const scene =
    document.querySelector(
      'a-scene'
    );


  const bantho =
    document.querySelector(
      '#bantho'
    );


  const rightHand =
    document.querySelector(
      '#rightHand'
    );


  if (
    !scene ||
    !bantho
  ) {
    return;
  }


  if (
    !bantho
      .hasAttribute(
        'temporary-offering-table-smoke'
      )
  ) {

    bantho
      .setAttribute(

        'temporary-offering-table-smoke',

        ''
      );
  }


  if (

    rightHand &&

    !rightHand
      .hasAttribute(
        'vr-offering-table-smoke-interactor'
      )
  ) {

    rightHand
      .setAttribute(

        'vr-offering-table-smoke-interactor',

        ''
      );
  }


  console.log(
    'Bantho incense interaction ready.'
  );
}


window.addEventListener(

  'DOMContentLoaded',

  () => {

    const scene =
      document.querySelector(
        'a-scene'
      );


    if (!scene) {
      return;
    }


    if (
      scene.hasLoaded
    ) {

      setupTemporaryOfferingTableSmoke();
    }

    else {

      scene.addEventListener(

        'loaded',

        setupTemporaryOfferingTableSmoke,

        {
          once:
            true
        }
      );
    }
  }
);


/* ============================================================
   DEBUG
============================================================ */

window.getRoomsIncenseDebug =
  function () {

    const incense =
      document.querySelector(
        '#incenseStick'
      );


    const bantho =
      document.querySelector(
        '#bantho'
      );


    const ritual =

      incense &&
      incense.components

        ? incense.components[
            'incense-offering'
          ]

        : null;


    const altarSmoke =

      bantho &&
      bantho.components

        ? bantho.components[
            'temporary-offering-table-smoke'
          ]

        : null;


    return {

      ritualState:
        ritual
          ? ritual.state
          : null,


      held:
        ritual
          ? ritual.isHeld()
          : false,


      bows:
        ritual
          ? ritual.bowCount
          : null,


      requiredBows:
        ritual
          ? ritual.data
              .requiredBows
          : null,


      completed:
        ritual
          ? ritual.completed
          : false,


      lightProgress:
        ritual
          ? ritual.lightProgress
          : null,


      altarSmokeLit:
        altarSmoke
          ? altarSmoke.hasBeenLit
          : false,


      altarSmokeBurnedOut:
        altarSmoke
          ? altarSmoke.hasBurnedOut
          : false,


      altarSmokeRemainingMs:
        altarSmoke
          ? altarSmoke.remainingMs
          : null,


      smokeOffsetX:
        altarSmoke
          ? altarSmoke.data
              .smokeOffsetX
          : null,


      smokeOffsetY:
        altarSmoke
          ? altarSmoke.data
              .smokeOffsetY
          : null,


      smokeOffsetZ:
        altarSmoke
          ? altarSmoke.data
              .smokeOffsetZ
          : null
    };
  };