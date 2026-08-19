/* ============================================================
   mirror.js
   ROOMS WITHIN

   Interactive psychological-horror mirror.

   - Mac: centre crosshair + click.
   - Quest: right-hand laser + trigger.
   - Emits "mirror-inspected".
   - Changes after the incense offering is completed.
   - All mirror timing respects the Rooms Within pause state.
============================================================ */


/* ============================================================
   HELPERS
============================================================ */

function mirrorGameplayLocked() {
  return Boolean(
    window.roomsPaused ||
    window.roomsInputLocked
  );
}


function mirrorWait(milliseconds) {
  if (window.waitRoomsMilliseconds) {
    return window.waitRoomsMilliseconds(milliseconds);
  }

  return new Promise((resolve) => {
    let remaining = Math.max(
      0,
      Number(milliseconds) || 0
    );

    let previous = performance.now();

    function step(now) {
      const elapsed = Math.max(
        0,
        now - previous
      );

      previous = now;

      if (!mirrorGameplayLocked()) {
        remaining -= elapsed;
      }

      if (remaining <= 0) {
        resolve();
        return;
      }

      window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);
  });
}


/* ============================================================
   HAUNTED MIRROR
============================================================ */

AFRAME.registerComponent('haunted-mirror', {
  schema: {
    surface: {
      type: 'selector'
    },

    distortion: {
      type: 'selector'
    },

    postOfferingPulseSpeed: {
      default: 1.6
    },

    inspectionDuration: {
      default: 1200
    }
  },


  init: function () {
    this.hasOfferingChanged = false;
    this.offeringChangeStarted = false;

    this.isInspecting = false;
    this.lastInspectTime = 0;
    this.inspectElapsed = 0;

    this.baseDistortionX = 0;
    this.baseDistortionY = 0;

    this.removed = false;

    this.inspect =
      this.inspect.bind(this);

    this.onOfferingCompleted =
      this.onOfferingCompleted.bind(this);

    this.el.addEventListener(
      'click',
      this.inspect
    );

    this.el.sceneEl.addEventListener(
      'offering-completed',
      this.onOfferingCompleted
    );

    if (this.data.distortion) {
      this.baseDistortionX =
        this.data.distortion.object3D.position.x;

      this.baseDistortionY =
        this.data.distortion.object3D.position.y;
    }

    this.setNormalLook();
  },


  /* ==========================================================
     NORMAL APPEARANCE
  ========================================================== */

  setNormalLook: function () {
    const surface =
      this.data.surface;

    const distortion =
      this.data.distortion;

    if (surface) {
      surface.object3D.scale.set(
        1,
        1,
        1
      );

      surface.setAttribute(
        'material',
        'color',
        '#57616a'
      );

      surface.setAttribute(
        'material',
        'metalness',
        0.92
      );

      surface.setAttribute(
        'material',
        'roughness',
        0.16
      );

      surface.setAttribute(
        'material',
        'emissive',
        '#101820'
      );

      surface.setAttribute(
        'material',
        'emissiveIntensity',
        0.12
      );
    }

    if (distortion) {
      distortion.object3D.position.x =
        this.baseDistortionX;

      distortion.object3D.position.y =
        this.baseDistortionY;

      distortion.setAttribute(
        'visible',
        false
      );

      distortion.setAttribute(
        'material',
        'opacity',
        0
      );
    }
  },


  /* ==========================================================
     HAUNTED APPEARANCE
  ========================================================== */

  setHauntedLook: function () {
    const surface =
      this.data.surface;

    const distortion =
      this.data.distortion;

    if (surface) {
      surface.object3D.scale.set(
        1,
        1,
        1
      );

      surface.setAttribute(
        'material',
        'color',
        '#30383c'
      );

      surface.setAttribute(
        'material',
        'metalness',
        0.88
      );

      surface.setAttribute(
        'material',
        'roughness',
        0.24
      );

      surface.setAttribute(
        'material',
        'emissive',
        '#142022'
      );

      surface.setAttribute(
        'material',
        'emissiveIntensity',
        0.28
      );
    }

    if (distortion) {
      distortion.setAttribute(
        'visible',
        true
      );

      distortion.setAttribute(
        'material',
        'opacity',
        0.045
      );
    }
  },


  /* ==========================================================
     OFFERING COMPLETED

     The 900 ms delay pauses whenever the game is paused.
  ========================================================== */

  onOfferingCompleted: async function () {
    if (
      this.offeringChangeStarted ||
      this.hasOfferingChanged
    ) {
      return;
    }

    this.offeringChangeStarted = true;

    await mirrorWait(900);

    if (
      this.removed ||
      !this.el.isConnected
    ) {
      return;
    }

    this.hasOfferingChanged = true;

    this.setHauntedLook();

    this.el.emit(
      'mirror-changed',
      {},
      false
    );

    this.el.sceneEl.emit(
      'mirror-changed',
      {},
      false
    );

    console.log(
      'Mirror changed after offering.'
    );
  },


  /* ==========================================================
     INSPECT
  ========================================================== */

  inspect: function (event) {
    if (mirrorGameplayLocked()) {
      return;
    }

    const now =
      performance.now();

    if (
      now -
      this.lastInspectTime <
      450
    ) {
      return;
    }

    if (this.isInspecting) {
      return;
    }

    this.lastInspectTime = now;

    if (
      event &&
      event.stopPropagation
    ) {
      event.stopPropagation();
    }

    this.startInspectionEffect();

    const detail = {
      afterOffering:
        this.hasOfferingChanged
    };

    this.el.emit(
      'mirror-inspected',
      detail,
      false
    );

    this.el.sceneEl.emit(
      'mirror-inspected',
      detail,
      false
    );

    console.log(
      this.hasOfferingChanged
        ? 'Mirror inspected after offering.'
        : 'Mirror inspected.'
    );
  },


  /* ==========================================================
     INSPECTION EFFECT

     This no longer uses setTimeout or A-Frame animation timers.
     The motion is calculated in tick(), so it freezes cleanly
     while the pause menu is open.
  ========================================================== */

  startInspectionEffect: function () {
    if (
      this.isInspecting ||
      !this.data.surface
    ) {
      return;
    }

    this.isInspecting = true;
    this.inspectElapsed = 0;

    if (this.data.distortion) {
      this.data.distortion.setAttribute(
        'visible',
        this.hasOfferingChanged
      );
    }
  },


  updateInspectionEffect: function (
    deltaTime
  ) {
    const surface =
      this.data.surface;

    const distortion =
      this.data.distortion;

    if (
      !this.isInspecting ||
      !surface
    ) {
      return;
    }

    this.inspectElapsed +=
      deltaTime;

    const duration =
      Math.max(
        1,
        this.data.inspectionDuration
      );

    const progress =
      THREE.MathUtils.clamp(
        this.inspectElapsed /
        duration,
        0,
        1
      );

    if (!this.hasOfferingChanged) {
      const pulse =
        Math.sin(
          progress *
          Math.PI *
          6
        );

      const amount =
        Math.max(
          0,
          1 - progress
        );

      surface.object3D.scale.set(
        1 +
          pulse *
          0.012 *
          amount,

        1 -
          pulse *
          0.008 *
          amount,

        1
      );

      surface.setAttribute(
        'material',
        'emissiveIntensity',
        0.12 +
          Math.abs(pulse) *
          0.30 *
          amount
      );
    } else {
      const pulse =
        Math.sin(
          progress *
          Math.PI *
          10
        );

      const amount =
        Math.max(
          0,
          1 - progress * 0.55
        );

      surface.object3D.scale.set(
        1 +
          pulse *
          0.025 *
          amount,

        1 -
          pulse *
          0.025 *
          amount,

        1
      );

      surface.setAttribute(
        'material',
        'emissiveIntensity',
        0.28 +
          Math.abs(pulse) *
          0.47 *
          amount
      );

      if (distortion) {
        distortion.setAttribute(
          'visible',
          true
        );

        distortion.setAttribute(
          'material',
          'opacity',
          0.045 +
            Math.abs(pulse) *
            0.125 *
            amount
        );
      }
    }

    if (progress >= 1) {
      this.finishInspectionEffect();
    }
  },


  finishInspectionEffect: function () {
    const surface =
      this.data.surface;

    const distortion =
      this.data.distortion;

    if (surface) {
      surface.object3D.scale.set(
        1,
        1,
        1
      );

      surface.setAttribute(
        'material',
        'emissiveIntensity',
        this.hasOfferingChanged
          ? 0.28
          : 0.12
      );
    }

    if (distortion) {
      distortion.setAttribute(
        'material',
        'opacity',
        this.hasOfferingChanged
          ? 0.045
          : 0
      );

      distortion.setAttribute(
        'visible',
        this.hasOfferingChanged
      );
    }

    this.inspectElapsed = 0;
    this.isInspecting = false;
  },


  /* ==========================================================
     IDLE HAUNTED MOVEMENT
  ========================================================== */

  updateHauntedIdle: function (
    time
  ) {
    const distortion =
      this.data.distortion;

    if (
      !this.hasOfferingChanged ||
      this.isInspecting ||
      !distortion
    ) {
      return;
    }

    const seconds =
      time * 0.001;

    const speed =
      this.data.postOfferingPulseSpeed;

    const swayX =
      Math.sin(
        seconds *
        speed
      ) * 0.004;

    const swayY =
      Math.sin(
        seconds *
        1.17 *
        speed +
        1.4
      ) * 0.0025;

    distortion.object3D.position.x =
      this.baseDistortionX +
      swayX;

    distortion.object3D.position.y =
      this.baseDistortionY +
      swayY;
  },


  /* ==========================================================
     FRAME UPDATE
  ========================================================== */

  tick: function (
    time,
    deltaTime
  ) {
    if (
      mirrorGameplayLocked() ||
      !deltaTime
    ) {
      return;
    }

    if (this.isInspecting) {
      this.updateInspectionEffect(
        deltaTime
      );

      return;
    }

    this.updateHauntedIdle(
      time
    );
  },


  /* ==========================================================
     PAUSE / PLAY LIFECYCLE
  ========================================================== */

  pause: function () {
    /*
      Nothing needs to be manually cancelled.
      Every moving/timed part is pause-aware.
    */
  },


  play: function () {
    /*
      tick() simply resumes from the same inspection elapsed time.
    */
  },


  /* ==========================================================
     CLEANUP
  ========================================================== */

  remove: function () {
    this.removed = true;

    this.el.removeEventListener(
      'click',
      this.inspect
    );

    this.el.sceneEl.removeEventListener(
      'offering-completed',
      this.onOfferingCompleted
    );

    this.finishInspectionEffect();
  }
});


/* ============================================================
   QUEST MIRROR INTERACTION
============================================================ */

AFRAME.registerComponent(
  'vr-mirror-interactor',
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
      this.triggerHeld = false;

      this.pressTrigger =
        this.pressTrigger.bind(this);

      this.releaseTrigger =
        this.releaseTrigger.bind(this);

      this.onTriggerChanged =
        this.onTriggerChanged.bind(this);

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
        mirrorGameplayLocked()
      ) {
        return;
      }

      this.triggerHeld = true;

      this.useMirror();
    },


    releaseTrigger: function () {
      this.triggerHeld = false;
    },


    onTriggerChanged: function (event) {
      const value =
        event &&
        event.detail &&
        typeof event.detail.value ===
          'number'
          ? event.detail.value
          : null;

      if (value === null) {
        return;
      }

      if (
        value >=
          this.data.pressThreshold &&
        !this.triggerHeld
      ) {
        this.pressTrigger();
      } else if (
        value <=
        this.data.releaseThreshold
      ) {
        this.releaseTrigger();
      }
    },


    useMirror: function () {
      if (mirrorGameplayLocked()) {
        return;
      }

      const raycaster =
        this.el.components.raycaster;

      const mirror =
        document.querySelector(
          '#mirror'
        );

      if (
        !raycaster ||
        !mirror
      ) {
        return;
      }

      if (
        raycaster.refreshObjects
      ) {
        raycaster.refreshObjects();
      }

      const intersection =
        raycaster.getIntersection
          ? raycaster.getIntersection(
              mirror
            )
          : null;

      if (!intersection) {
        return;
      }

      const component =
        mirror.components[
          'haunted-mirror'
        ];

      if (component) {
        component.inspect();
      }
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