/* ============================================================
   TEMPORARY OFFERING TABLE SMOKE

   Mac:
   - centre crosshair
   - click altar once

   Quest:
   - right controller laser
   - trigger once

   FIXES:
   - large invisible altar hitbox
   - direct Quest hitbox ray check
   - immediate smoke
   - smoke placed in middle of bantho
============================================================ */

function ritualGameplayLocked() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );
}


function ritualAppendRaycasterSelector(entity, selector) {
  if (!entity || !selector) {
    return;
  }

  const data =
    entity.getAttribute('raycaster') || {};

  const selectors =
    String(data.objects || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  if (!selectors.includes(selector)) {
    selectors.push(selector);
  }

  entity.setAttribute(
    'raycaster',
    'objects',
    selectors.join(', ')
  );

  const raycaster =
    entity.components.raycaster;

  if (
    raycaster &&
    raycaster.refreshObjects
  ) {
    raycaster.refreshObjects();
  }
}


/* ============================================================
   TEMPORARY TABLE SMOKE COMPONENT
============================================================ */

AFRAME.registerComponent(
  'temporary-offering-table-smoke',
  {
    schema: {
      duration: {
        default: 4500
      },

      /*
        Height of the altar surface.

        0 = bottom of model
        1 = very top of model

        0.62 matches the approximate offering-table surface
        already used by the incense ritual.
      */
      surfaceRatio: {
        default: 0.62
      },

      smokeYOffset: {
        default: 0.07
      },

      count: {
        default: 24
      },

      height: {
        default: 0.85
      },

      speed: {
        default: 0.20
      },

      width: {
        default: 0.13
      },

      opacity: {
        default: 0.24
      },

      size: {
        default: 0.052
      },

      color: {
        default: '#d4d4d4'
      },

      hitboxScale: {
        default: 1.08
      }
    },


    init: function () {
      this.smokeAnchor = null;
      this.hitbox = null;

      this.remainingMs = 0;
      this.lastTriggerTime = 0;

      this.onModelLoaded =
        this.onModelLoaded.bind(this);

      this.onHitboxClick =
        this.onHitboxClick.bind(this);

      this.el.addEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      this.createSmokeAnchor();
      this.createHitbox();

      if (
        this.el.getObject3D('mesh')
      ) {
        this.onModelLoaded();
      }
    },


    /* ========================================================
       CREATE SMOKE SOURCE
    ======================================================== */

    createSmokeAnchor: function () {
      if (this.smokeAnchor) {
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
          active: false,
          count: this.data.count,
          height: this.data.height,
          speed: this.data.speed,
          width: this.data.width,
          opacity: this.data.opacity,
          size: this.data.size,
          color: this.data.color
        }
      );

      this.el.sceneEl.appendChild(
        anchor
      );

      this.smokeAnchor =
        anchor;
    },


    /* ========================================================
       CREATE LARGE INVISIBLE CLICK TARGET

       Instead of relying on the individual Blender meshes,
       we surround bantho.glb with one simple transparent box.

       This makes it much easier and more reliable to press.
    ======================================================== */

    createHitbox: function () {
      if (this.hitbox) {
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

      hitbox.classList.add(
        'offering-smoke-hitbox'
      );

      hitbox.setAttribute(
        'material',
        `
          opacity: 0;
          transparent: true;
          depthWrite: false;
          side: double
        `
      );

      /*
        Do NOT set visible=false.

        An invisible Three.js object is not raycastable.

        Opacity 0 means:
        invisible to the player,
        but still available for interaction.
      */
      hitbox.setAttribute(
        'visible',
        true
      );

      hitbox.addEventListener(
        'click',
        this.onHitboxClick
      );

      this.el.sceneEl.appendChild(
        hitbox
      );

      this.hitbox =
        hitbox;
    },


    onModelLoaded: function () {
      this.updateInteractionLayout();
    },


    /* ========================================================
       POSITION HITBOX + SMOKE
    ======================================================== */

    updateInteractionLayout: function () {
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

      root.updateMatrixWorld(
        true
      );

      const box =
        ritualWorldBox(
          root
        );

      if (!box) {
        return false;
      }

      const size =
        box.getSize(
          new THREE.Vector3()
        );

      const center =
        box.getCenter(
          new THREE.Vector3()
        );


      /* ======================================================
         SMOKE POSITION

         EXACT CENTER horizontally:

         X = altar middle
         Z = altar middle

         Y = estimated tabletop height
      ====================================================== */

      const smokeWorld =
        new THREE.Vector3(
          center.x,

          box.min.y +
            size.y *
            this.data.surfaceRatio +
            this.data.smokeYOffset,

          center.z
        );


      this.el.sceneEl.object3D
        .updateMatrixWorld(
          true
        );


      this.smokeAnchor.object3D
        .position
        .copy(
          this.el.sceneEl.object3D
            .worldToLocal(
              smokeWorld.clone()
            )
        );


      /* ======================================================
         INVISIBLE HITBOX

         Make it slightly larger than bantho.glb.

         You therefore do not need to hit a tiny mesh exactly.
      ====================================================== */

      const hitboxWorldCenter =
        center.clone();

      const localHitboxCenter =
        this.el.sceneEl.object3D
          .worldToLocal(
            hitboxWorldCenter.clone()
          );


      this.hitbox.object3D
        .position
        .copy(
          localHitboxCenter
        );


      this.hitbox.setAttribute(
        'width',

        Math.max(
          size.x *
            this.data.hitboxScale,

          0.55
        )
      );


      this.hitbox.setAttribute(
        'height',

        Math.max(
          size.y *
            this.data.hitboxScale,

          0.65
        )
      );


      this.hitbox.setAttribute(
        'depth',

        Math.max(
          size.z *
            this.data.hitboxScale,

          0.35
        )
      );


      /* ======================================================
         ADD HITBOX TO MAC + QUEST RAYS
      ====================================================== */

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
        !rightHand.hasAttribute(
          'vr-offering-table-smoke-interactor'
        )
      ) {
        rightHand.setAttribute(
          'vr-offering-table-smoke-interactor',
          ''
        );
      }


      console.log(
        'Bantho hitbox ready.',
        'Smoke centre:',
        smokeWorld
      );


      return true;
    },


    /* ========================================================
       MAC CLICK
    ======================================================== */

    onHitboxClick: function (event) {
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

      this.triggerSmoke();
    },


    /* ========================================================
       START SMOKE
    ======================================================== */

    triggerSmoke: function () {
      if (
        ritualGameplayLocked()
      ) {
        return false;
      }

      const now =
        performance.now();

      /*
        Only protects against accidental duplicate events.

        250 ms is short enough that the interaction still feels
        immediate.
      */
      if (
        now -
          this.lastTriggerTime <
        250
      ) {
        return false;
      }

      this.lastTriggerTime =
        now;


      /*
        Recalculate the altar in case model transforms changed.
      */
      if (
        !this.updateInteractionLayout()
      ) {
        return false;
      }


      const smoke =
        this.smokeAnchor
          .components[
            'incense-smoke'
          ];


      /*
        IMPORTANT:

        Restart smoke with visible puffs immediately.

        Without this, many particles begin with negative life and
        the player can think the first button press did nothing.
      */
      if (
        smoke &&
        smoke.restartPuffs
      ) {
        smoke.restartPuffs();
      }


      this.smokeAnchor.setAttribute(
        'incense-smoke',
        'active',
        true
      );


      this.remainingMs =
        this.data.duration;


      this.el.emit(
        'temporary-offering-smoke',
        {},
        false
      );


      this.el.sceneEl.emit(
        'temporary-offering-smoke',
        {},
        false
      );


      console.log(
        'Bantho interaction: smoke started.'
      );


      return true;
    },


    stopSmoke: function () {
      this.remainingMs = 0;

      if (
        this.smokeAnchor
      ) {
        this.smokeAnchor.setAttribute(
          'incense-smoke',
          'active',
          false
        );
      }
    },


    tick: function (
      time,
      deltaTime
    ) {
      if (
        ritualGameplayLocked() ||
        this.remainingMs <= 0 ||
        !deltaTime
      ) {
        return;
      }

      this.remainingMs -=
        deltaTime;

      if (
        this.remainingMs <= 0
      ) {
        this.stopSmoke();
      }
    },


    remove: function () {
      this.el.removeEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      if (this.hitbox) {
        this.hitbox.removeEventListener(
          'click',
          this.onHitboxClick
        );

        if (
          this.hitbox.parentNode
        ) {
          this.hitbox.parentNode
            .removeChild(
              this.hitbox
            );
        }
      }

      if (
        this.smokeAnchor &&
        this.smokeAnchor.parentNode
      ) {
        this.smokeAnchor.parentNode
          .removeChild(
            this.smokeAnchor
          );
      }
    }
  }
);


/* ============================================================
   QUEST OFFERING TABLE INTERACTION
============================================================ */

AFRAME.registerComponent(
  'vr-offering-table-smoke-interactor',
  {
    schema: {
      pressThreshold: {
        default: 0.65
      },

      releaseThreshold: {
        default: 0.2
      }
    },


    init: function () {
      this.triggerHeld =
        false;

      this.pressTrigger =
        this.pressTrigger
          .bind(this);

      this.releaseTrigger =
        this.releaseTrigger
          .bind(this);

      this.onTriggerChanged =
        this.onTriggerChanged
          .bind(this);


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


    pressTrigger: function () {
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


    releaseTrigger: function () {
      this.triggerHeld =
        false;
    },


    onTriggerChanged:
      function (event) {

        const value =
          event &&
          event.detail &&
          typeof event.detail.value ===
            'number'
            ? event.detail.value
            : null;


        if (
          value === null
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
        } else if (
          value <=
          this.data
            .releaseThreshold
        ) {
          this.releaseTrigger();
        }
      },


    /* ========================================================
       QUEST HIT

       IMPORTANT FIX:

       We directly ask:

       "Did the laser hit the offering-table hitbox?"

       We NO LONGER ask for intersections[0].
    ======================================================== */

    useOfferingTable: function () {
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


      if (!component) {
        return false;
      }


      if (
        raycaster.refreshObjects
      ) {
        raycaster.refreshObjects();
      }


      const intersection =
        raycaster.getIntersection
          ? raycaster.getIntersection(
              hitbox
            )
          : null;


      if (!intersection) {
        return false;
      }


      return component
        .triggerSmoke();
    },


    remove: function () {
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
   AUTO SETUP
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
    !bantho.hasAttribute(
      'temporary-offering-table-smoke'
    )
  ) {
    bantho.setAttribute(
      'temporary-offering-table-smoke',
      ''
    );
  }


  if (
    rightHand &&
    !rightHand.hasAttribute(
      'vr-offering-table-smoke-interactor'
    )
  ) {
    rightHand.setAttribute(
      'vr-offering-table-smoke-interactor',
      ''
    );
  }


  console.log(
    'Temporary bantho interaction ready.'
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


    if (scene.hasLoaded) {
      setupTemporaryOfferingTableSmoke();
    } else {
      scene.addEventListener(
        'loaded',
        setupTemporaryOfferingTableSmoke,
        {
          once: true
        }
      );
    }
  }
);