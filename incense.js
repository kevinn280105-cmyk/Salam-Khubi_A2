/* ============================================================
   incense.js
   ROOMS WITHIN - VIETNAMESE ALTAR / INCENSE OFFERING

   Ritual:
   1. Pick up incense.
   2. Hold burning tip near flame for ~0.7 sec.
   3. Ember + smoke start.
   4. Bow 3 times while holding incense.
   5. Move LOWER end into bát hương.
   6. Incense snaps upright.
   7. Emits "offering-completed".
   8. Lights flicker and blackout shortly afterward.
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


function ritualWait(ms) {
  return new Promise(
    (resolve) =>
      window.setTimeout(resolve, ms)
  );
}


function ritualNormalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');
}


function ritualFindNamedObject(root, keywords) {
  if (!root) return null;

  const normalizedKeywords =
    keywords.map(ritualNormalizeName);

  let result = null;

  root.traverse((node) => {
    if (result) return;

    const names = [
      node.name || ''
    ];

    if (node.material) {
      const materials =
        Array.isArray(node.material)
          ? node.material
          : [node.material];

      materials.forEach((material) => {
        if (
          material &&
          material.name
        ) {
          names.push(material.name);
        }
      });
    }

    const combined =
      ritualNormalizeName(
        names.join(' ')
      );

    if (
      normalizedKeywords.some(
        (keyword) =>
          combined.includes(keyword)
      )
    ) {
      result = node;
    }
  });

  return result;
}


function ritualWorldCenter(object) {
  if (!object) return null;

  object.updateMatrixWorld(true);

  const box =
    new THREE.Box3()
      .setFromObject(object);

  if (box.isEmpty()) return null;

  return box.getCenter(
    new THREE.Vector3()
  );
}


function ritualWorldBox(object) {
  if (!object) return null;

  object.updateMatrixWorld(true);

  const box =
    new THREE.Box3()
      .setFromObject(object);

  return box.isEmpty()
    ? null
    : box;
}


/* ============================================================
   INCENSE SMOKE

   Bottom:
   thin + straight

   Middle:
   gentle curling

   Top:
   wider + irregular + fading
============================================================ */

AFRAME.registerComponent(
  'incense-smoke',
  {

    schema: {
      active: {
        default: false
      },

      count: {
        default: 12
      },

      height: {
        default: 0.9
      },

      speed: {
        default: 0.18
      },

      width: {
        default: 0.085
      },

      opacity: {
        default: 0.16
      },

      size: {
        default: 0.035
      },

      color: {
        default: '#c5c5c5'
      }
    },


    init: function () {

      this.puffs = [];

      this.tipWorld =
        new THREE.Vector3();

      this.cameraQuat =
        new THREE.Quaternion();

      this.circleGeometry =
        new THREE.CircleGeometry(
          1,
          10
        );


      const sceneObject =
        this.el.sceneEl.object3D;


      for (
        let i = 0;
        i < this.data.count;
        i++
      ) {

        const material =
          new THREE.MeshBasicMaterial({
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

            side:
              THREE.DoubleSide
          });


        const mesh =
          new THREE.Mesh(
            this.circleGeometry,
            material
          );


        mesh.visible =
          false;


        mesh.renderOrder =
          20;


        sceneObject.add(
          mesh
        );


        this.puffs.push({
          mesh:
            mesh,

          material:
            material,

          life:
            -(
              i /
              Math.max(
                this.data.count,
                1
              )
            ),

          phase:
            Math.random() *
            Math.PI *
            2,

          drift:
            (
              Math.random() -
              0.5
            ) *
            0.55,

          sizeSeed:
            0.78 +
            Math.random() *
            0.5
        });

      }

    },


    update: function () {

      if (
        !this.data.active
      ) {

        this.puffs.forEach(
          (puff) => {

            puff.mesh.visible =
              false;

            puff.material.opacity =
              0;

          }
        );

      }

    },


    resetPuff: function (puff) {

      puff.life =
        0;


      puff.phase =
        Math.random() *
        Math.PI *
        2;


      puff.drift =
        (
          Math.random() -
          0.5
        ) *
        0.55;


      puff.sizeSeed =
        0.78 +
        Math.random() *
        0.5;

    },


    tick: function (
      time,
      deltaTime
    ) {

      if (
        !this.data.active ||
        !deltaTime
      ) {
        return;
      }


      this.el.object3D
        .getWorldPosition(
          this.tipWorld
        );


      const camera =
        this.el.sceneEl.camera;


      if (camera) {
        camera.getWorldQuaternion(
          this.cameraQuat
        );
      }


      const dt =
        Math.min(
          deltaTime / 1000,
          0.05
        );


      const t =
        time * 0.001;


      this.puffs.forEach(
        (puff) => {

          puff.life +=
            dt *
            this.data.speed *
            1.55;


          if (
            puff.life > 1
          ) {
            this.resetPuff(puff);
          }


          if (
            puff.life < 0
          ) {

            puff.mesh.visible =
              false;

            return;
          }


          const life =
            puff.life;


          const y =
            life *
            this.data.height;


          /* Lower smoke remains narrow. */

          const lower =
            THREE.MathUtils.clamp(
              life / 0.30,
              0,
              1
            );


          /* Upper smoke becomes turbulent. */

          const turbulence =
            THREE.MathUtils.clamp(
              (life - 0.22) /
              0.78,
              0,
              1
            );


          const narrowSway =
            Math.sin(
              t * 0.9 +
              puff.phase
            ) *
            this.data.width *
            0.055 *
            lower;


          const curlX =
            Math.sin(
              t * 1.15 +
              puff.phase +
              life * 8.2
            ) *
            this.data.width *
            turbulence;


          const curlZ =
            Math.cos(
              t * 0.82 +
              puff.phase *
              1.3 +
              life * 6.4
            ) *
            this.data.width *
            0.62 *
            turbulence;


          const upperDrift =
            puff.drift *
            this.data.width *
            Math.pow(
              turbulence,
              1.7
            );


          puff.mesh.position.set(

            this.tipWorld.x +
              narrowSway +
              curlX +
              upperDrift,

            this.tipWorld.y +
              y,

            this.tipWorld.z +
              curlZ

          );


          const scale =
            this.data.size *
            puff.sizeSeed *
            (
              1 +
              life *
              1.8
            );


          puff.mesh.scale.set(

            scale,

            scale * 1.18,

            scale

          );


          /*
            Smoke always faces camera.
          */

          if (camera) {

            puff.mesh.quaternion.copy(
              this.cameraQuat
            );

          }


          const fadeIn =
            THREE.MathUtils.clamp(
              life / 0.08,
              0,
              1
            );


          const fadeOut =
            Math.pow(
              1 - life,
              1.25
            );


          puff.material.opacity =
            this.data.opacity *
            fadeIn *
            fadeOut;


          puff.mesh.visible =
            puff.material.opacity >
            0.002;

        }

      );

    },


    remove: function () {

      const sceneObject =
        this.el.sceneEl.object3D;


      this.puffs.forEach(
        (puff) => {

          sceneObject.remove(
            puff.mesh
          );

          puff.material.dispose();

        }
      );


      if (
        this.circleGeometry
      ) {

        this.circleGeometry.dispose();

      }


      this.puffs = [];

    }

  }
);


/* ============================================================
   OFFERING TABLE LAYOUT

   Attempts to automatically find:

   bát hương:
   - bat huong
   - bathuong
   - incense bowl
   - incense burner
   - censer
   - urn

   flame:
   - candle
   - nen
   - lamp
   - den dau
   - oil lamp
   - flame
   - lua

   If names cannot be found,
   positions are estimated using bantho.glb.
============================================================ */

AFRAME.registerComponent(
  'offering-layout',
  {

    schema: {

      altar: {
        type: 'selector'
      },


      surfaceRatio: {
        default: 0.62
      },


      pickupSide: {
        default: -0.28
      },


      flameSide: {
        default: 0.28
      },


      frontOffset: {
        default: 0
      },


      temporaryFlame: {
        default: true
      },


      debugVisible: {
        default: false
      }

    },


    init: function () {

      this.applyLayout =
        this.applyLayout
          .bind(this);


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


    setEntityWorldPosition:
      function (
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

          entity.object3D.position.copy(
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


        entity.object3D.position.copy(
          local
        );

      },


    applyLayout: function () {

      const altar =
        this.data.altar;


      const root =
        altar
          ? altar.getObject3D(
              'mesh'
            )
          : null;


      if (!root) {
        return;
      }


      root.updateMatrixWorld(
        true
      );


      const altarBox =
        ritualWorldBox(root);


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


      /* ------------------------------------------------------
         SEARCH FOR BÁT HƯƠNG
      ------------------------------------------------------ */

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


      /* ------------------------------------------------------
         SEARCH FOR FLAME / CANDLE
      ------------------------------------------------------ */

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
        this.data.surfaceRatio;


      let bowlPosition;


      /* ------------------------------------------------------
         REAL BÁT HƯƠNG FOUND
      ------------------------------------------------------ */

      if (bowlObject) {

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
                ) * 0.5,

                bowlBox.max.y +
                  0.015,

                (
                  bowlBox.min.z +
                  bowlBox.max.z
                ) * 0.5

              )

            : ritualWorldCenter(
                bowlObject
              );


        console.log(

          'Offering layout: bat huong object found:',

          bowlObject.name

        );


      /* ------------------------------------------------------
         FALLBACK BÁT HƯƠNG POSITION
      ------------------------------------------------------ */

      } else {


        bowlPosition =
          new THREE.Vector3(

            center.x,

            surfaceY +
              0.035,

            center.z +
              this.data
                .frontOffset

          );


        console.log(
          'Offering layout: no named bat huong found; using altar estimate.'
        );

      }


      let flamePosition;


      /* ------------------------------------------------------
         REAL CANDLE / LAMP FOUND
      ------------------------------------------------------ */

      if (flameObject) {

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
                ) * 0.5,

                flameBox.max.y +
                  0.025,

                (
                  flameBox.min.z +
                  flameBox.max.z
                ) * 0.5

              )

            : ritualWorldCenter(
                flameObject
              );


        console.log(

          'Offering layout: flame/lamp object found:',

          flameObject.name

        );


      /* ------------------------------------------------------
         TEMPORARY FLAME
      ------------------------------------------------------ */

      } else {


        flamePosition =
          new THREE.Vector3(

            center.x +
              size.x *
              this.data.flameSide,

            surfaceY +
              0.12,

            center.z +
              this.data.frontOffset

          );


        console.log(
          'Offering layout: no named candle/lamp found; using temporary flame.'
        );

      }


      /* ------------------------------------------------------
         STARTING INCENSE POSITION
      ------------------------------------------------------ */

      const pickupPosition =
        new THREE.Vector3(

          center.x +
            size.x *
            this.data.pickupSide,

          surfaceY +
            0.055,

          center.z +
            this.data.frontOffset

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


      /* ------------------------------------------------------
         MOVE BOWL ZONE
      ------------------------------------------------------ */

      this.setEntityWorldPosition(
        bowlZone,
        bowlPosition
      );


      /*
        Temporary stick is 0.38m high.

        Its centre needs to sit 0.19m above
        the insertion point.
      */

      this.setEntityWorldPosition(

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


      /* ------------------------------------------------------
         MOVE FLAME
      ------------------------------------------------------ */

      this.setEntityWorldPosition(
        flameZone,
        flamePosition
      );


      this.setEntityWorldPosition(
        flameVisual,
        flamePosition
      );


      /* ------------------------------------------------------
         MOVE INCENSE PICKUP
      ------------------------------------------------------ */

      this.setEntityWorldPosition(
        incense,
        pickupPosition
      );


      /*
        Incense begins lying down on altar.
      */

      if (
        incense &&
        !incense.is(
          'grabbed'
        )
      ) {

        incense.object3D
          .rotation.set(

            0,

            0,

            THREE.MathUtils
              .degToRad(
                90
              )

          );

      }


      /* ------------------------------------------------------
         SHOW TEMPORARY FLAME ONLY IF
         NO REAL CANDLE WAS FOUND
      ------------------------------------------------------ */

      if (flameVisual) {

        flameVisual.setAttribute(

          'visible',

          Boolean(
            this.data
              .temporaryFlame &&
            !flameObject
          )

        );

      }


      /* ------------------------------------------------------
         OPTIONAL DEBUG ZONES
      ------------------------------------------------------ */

      const debugVisible =
        Boolean(
          this.data.debugVisible
        );


      if (bowlZone) {

        bowlZone.setAttribute(

          'material',

          `
            color: #00ff88;
            opacity: ${debugVisible ? 0.25 : 0};
            transparent: true;
            depthWrite: false
          `

        );

      }


      if (flameZone) {

        flameZone.setAttribute(

          'material',

          `
            color: #ff7b00;
            opacity: ${debugVisible ? 0.25 : 0};
            transparent: true;
            depthWrite: false
          `

        );

      }


      console.log(
        'Offering interaction positioned near bantho.glb.'
      );

    },


    remove: function () {

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
        type: 'selector'
      },


      base: {
        type: 'selector'
      },


      flameZone: {
        type: 'selector'
      },


      bowlZone: {
        type: 'selector'
      },


      placedPoint: {
        type: 'selector'
      },


      ember: {
        type: 'selector'
      },


      tipFlame: {
        type: 'selector'
      },


      requiredBows: {
        default: 3
      },


      lightDistance: {
        default: 0.11
      },


      lightHoldTime: {
        default: 700
      },


      placeDistance: {
        default: 0.13
      },


      bowDownAngle: {
        default: 28
      },


      bowUpAngle: {
        default: 12
      },


      bowCooldown: {
        default: 450
      }

    },


    init: function () {

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
        this.onKeyDown.bind(
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

        this.data.tip &&

        this.data.tip.components[
          'incense-smoke'
        ]

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


    /* ======================================================
       IS CURRENTLY BEING HELD?
    ====================================================== */

    isHeld: function () {

      return (
        this.el.is &&
        this.el.is(
          'grabbed'
        )
      );

    },


    /* ======================================================
       IS LIT?
    ====================================================== */

    isLit: function () {

      return (

        this.state ===
          'lit' ||

        this.state ===
          'placed'

      );

    },


    /* ======================================================
       MAC BOW TEST

       Press B while holding lit incense.
    ====================================================== */

    onKeyDown:
      function (
        event
      ) {

        if (

          String(
            event.key || ''
          ).toLowerCase() ===
            'b' &&

          !ritualIsImmersiveXR(
            this.el.sceneEl
          )

        ) {

          if (

            this.isLit() &&

            this.isHeld() &&

            !this.completed

          ) {

            this.registerBow();

          }

        }

      },


    /* ======================================================
       QUEST HEAD ANGLE
    ====================================================== */

    getHeadDownAngle:
      function () {

        const cameraEl =
          document.querySelector(
            '#cam'
          );


        if (!cameraEl) {
          return 0;
        }


        cameraEl.object3D
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


        return (

          THREE.MathUtils
            .radToDeg(

              Math.asin(

                THREE.MathUtils
                  .clamp(

                    -this.forward.y,

                    -1,

                    1

                  )

              )

            )

        );

      },


    /* ======================================================
       REGISTER ONE BOW
    ====================================================== */

    registerBow:
      function () {

        const now =
          performance.now();


        if (

          now -
          this.lastBowTime <

          this.data.bowCooldown

        ) {

          return;

        }


        if (

          this.bowCount >=
          this.data.requiredBows

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
              this.data.requiredBows

          },

          false

        );


        if (

          this.bowCount >=
          this.data.requiredBows

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


    /* ======================================================
       QUEST BOW DETECTION

       Down → back upright = one bow.
    ====================================================== */

    updateBowDetection:
      function () {

        if (

          !ritualIsImmersiveXR(
            this.el.sceneEl
          ) ||

          !this.isHeld() ||

          !this.isLit() ||

          this.completed ||

          this.bowCount >=
            this.data.requiredBows

        ) {

          return;

        }


        const downAngle =
          this.getHeadDownAngle();


        /*
          Head moves downward.
        */

        if (

          !this.bowWasDown &&

          downAngle >=
            this.data.bowDownAngle

        ) {

          this.bowWasDown =
            true;


          return;

        }


        /*
          Return upright.

          Only then does the bow count.
        */

        if (

          this.bowWasDown &&

          downAngle <=
            this.data.bowUpAngle

        ) {

          this.bowWasDown =
            false;


          this.registerBow();

        }

      },


    /* ======================================================
       LIGHT INCENSE
    ====================================================== */

    lightIncense:
      function () {

        if (
          this.state !==
          'unlit'
        ) {

          return;

        }


        this.state =
          'lit';


        this.lightProgress =
          0;


        /* --------------------------------------------------
           EMBER
        -------------------------------------------------- */

        if (
          this.data.ember
        ) {

          this.data.ember
            .setAttribute(
              'visible',
              true
            );

        }


        /* --------------------------------------------------
           SMALL FLAME FOR 0.45 SEC
        -------------------------------------------------- */

        if (
          this.data.tipFlame
        ) {

          this.data.tipFlame
            .setAttribute(
              'visible',
              true
            );


          window.setTimeout(

            () => {

              if (
                this.data.tipFlame
              ) {

                this.data.tipFlame
                  .setAttribute(
                    'visible',
                    false
                  );

              }

            },

            450

          );

        }


        /* --------------------------------------------------
           SMOKE STARTS
        -------------------------------------------------- */

        if (
          this.data.tip
        ) {

          this.data.tip
            .setAttribute(

              'incense-smoke',

              'active',

              true

            );

        }


        console.log(
          'Incense lit. Smoke started. Bow three times while holding it.'
        );


        this.el.emit(

          'incense-lit',

          {},

          false

        );

      },


    /* ======================================================
       DETECT INCENSE TIP IN FLAME
    ====================================================== */

    updateLighting:
      function (
        deltaTime
      ) {

        if (

          this.state !==
            'unlit' ||

          !this.isHeld() ||

          !this.data.tip ||

          !this.data.flameZone

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


        this.data.flameZone
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
          this.data.lightDistance

        ) {

          this.lightProgress +=
            deltaTime;


          if (

            this.lightProgress >=
            this.data.lightHoldTime

          ) {

            this.lightIncense();

          }


        } else {


          this.lightProgress =
            0;

        }

      },


    /* ======================================================
       CHECK PLACEMENT INTO BÁT HƯƠNG
    ====================================================== */

    updatePlacement:
      function () {

        if (

          !this.isLit() ||

          this.completed ||

          !this.isHeld() ||

          !this.data.base ||

          !this.data.bowlZone

        ) {

          return;

        }


        this.data.base
          .object3D
          .getWorldPosition(
            this.baseWorld
          );


        this.data.bowlZone
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
          this.data.placeDistance

        ) {

          this.warnedPlacementEarly =
            false;


          return;

        }


        /*
          Cannot place until all 3 bows.
        */

        if (

          this.bowCount <
          this.data.requiredBows

        ) {

          if (
            !this.warnedPlacementEarly
          ) {

            console.log(

              `Offering: ${this.bowCount}/${this.data.requiredBows} bows complete. Finish bowing before placing the incense.`

            );


            this.warnedPlacementEarly =
              true;

          }


          return;

        }


        this.placeIncense();

      },


    /* ======================================================
       REMOVE FROM HAND WITHOUT THROWING
    ====================================================== */

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


        /*
          Return object to scene while
          preserving current position.
        */

        if (
          grabbable
            .reparentPreserveWorld
        ) {

          grabbable
            .reparentPreserveWorld(
              this.el.sceneEl.object3D
            );


        } else {


          this.el.sceneEl.object3D
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

          grabbable.velocity.set(
            0,
            0,
            0
          );

        }


        if (
          this.el.is(
            'grabbed'
          )
        ) {

          this.el.removeState(
            'grabbed'
          );

        }

      },


    /* ======================================================
       FINAL PLACEMENT
    ====================================================== */

    placeIncense:
      function () {

        if (

          this.completed ||

          !this.data.placedPoint

        ) {

          return;

        }


        this.detachFromCurrentHolder();


        const worldPosition =
          new THREE.Vector3();


        const worldQuaternion =
          new THREE.Quaternion();


        this.data.placedPoint
          .object3D
          .getWorldPosition(
            worldPosition
          );


        this.data.placedPoint
          .object3D
          .getWorldQuaternion(
            worldQuaternion
          );


        /*
          Scene is parent after detach,
          therefore world coordinates can
          be copied directly.
        */

        this.el.object3D
          .position.copy(
            worldPosition
          );


        this.el.object3D
          .quaternion.copy(
            worldQuaternion
          );


        this.state =
          'placed';


        this.completed =
          true;


        /*
          Cannot pick it up again.
        */

        this.el.classList.remove(
          'item'
        );


        this.el.classList.remove(
          'interactable'
        );


        this.el.removeAttribute(
          'natural-grabbable'
        );


        console.log(
          'Offering completed. Incense placed in bat huong.'
        );


        const detail = {

          bows:
            this.bowCount,

          requiredBows:
            this.data.requiredBows

        };


        /*
          Local event.
        */

        this.el.emit(

          'offering-completed',

          detail,

          false

        );


        /*
          Scene-wide event.
        */

        this.el.sceneEl.emit(

          'offering-completed',

          detail,

          false

        );


        /*
          Story manager also receives it.
        */

        const story =

          document.querySelector(
            '#story-manager'
          );


        if (story) {

          story.emit(

            'offering-completed',

            detail,

            false

          );

        }

      },


    /* ======================================================
       MAIN LOOP
    ====================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {

        if (

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

        window.removeEventListener(

          'keydown',

          this.onKeyDown

        );

      }

  }

);


/* ============================================================
   OFFERING BLACKOUT

   After ritual:

   wait
   ↓
   flicker
   ↓
   flicker
   ↓
   blackout
   ↓
   lights return
============================================================ */

AFRAME.registerComponent(
  'offering-blackout',
  {

    schema: {

      delay: {
        default: 1400
      },


      blackoutDuration: {
        default: 1900
      }

    },


    init: function () {

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
          .bind(this);


      this.el.sceneEl
        .addEventListener(

          'offering-completed',

          this.onOfferingCompleted

        );

    },


    /* ======================================================
       REMEMBER CURRENT LIGHTS
    ====================================================== */

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

              this.lightStates.push({

                entity:
                  entity,

                light:
                  Object.assign(

                    {},

                    entity.getAttribute(
                      'light'
                    ) || {}

                  ),

                hadFlicker:
                  entity.hasAttribute(
                    'flicker'
                  ),

                flicker:
                  entity.hasAttribute(
                    'flicker'
                  )

                    ? Object.assign(

                        {},

                        entity.getAttribute(
                          'flicker'
                        ) || {}

                      )

                    : null

              });

            }

          );

      },


    /* ======================================================
       ALL LIGHTS OFF
    ====================================================== */

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


    /* ======================================================
       RESTORE LIGHTS
    ====================================================== */

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


    /* ======================================================
       BLACKOUT SEQUENCE
    ====================================================== */

    onOfferingCompleted:
      async function () {

        if (
          this.hasRun
        ) {

          return;

        }


        this.hasRun =
          true;


        /*
          Small pause after incense placement.
        */

        await ritualWait(
          this.data.delay
        );


        this.captureLights();


        /* --------------------------------------------------
           TV

           If TV is ON, switch it off during blackout.
        -------------------------------------------------- */

        const living =

          document.querySelector(
            '#living'
          );


        this.tvComponent =

          living &&
          living.components

            ? living.components[
                'embedded-tv'
              ] || null

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


        /* --------------------------------------------------
           HORROR FLICKER 1
        -------------------------------------------------- */

        this.lightsOff();

        await ritualWait(
          90
        );

        this.lightsOn();

        await ritualWait(
          210
        );


        /* --------------------------------------------------
           HORROR FLICKER 2
        -------------------------------------------------- */

        this.lightsOff();

        await ritualWait(
          70
        );

        this.lightsOn();

        await ritualWait(
          135
        );


        /* --------------------------------------------------
           HORROR FLICKER 3
        -------------------------------------------------- */

        this.lightsOff();

        await ritualWait(
          130
        );

        this.lightsOn();

        await ritualWait(
          180
        );


        /* --------------------------------------------------
           FULL BLACKOUT
        -------------------------------------------------- */

        this.lightsOff();


        this.el.sceneEl.emit(

          'offering-blackout-started',

          {},

          false

        );


        await ritualWait(
          this.data.blackoutDuration
        );


        /* --------------------------------------------------
           LIGHTS RETURN
        -------------------------------------------------- */

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