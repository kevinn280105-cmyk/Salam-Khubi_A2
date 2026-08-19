  /* ============================================================
   mirror.js
   ROOMS WITHIN

   Interactive psychological-horror mirror.

   - No GLB required.
   - Mac: centre crosshair + click.
   - Quest: right-hand laser + trigger.
   - Emits "mirror-inspected".
   - Changes after the incense offering is completed.
============================================================ */


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
    this.isInspecting = false;
    this.lastInspectTime = 0;
    this.changeTimer = null;
    this.inspectTimer = null;

    this.inspect = this.inspect.bind(this);
    this.onOfferingCompleted =
      this.onOfferingCompleted.bind(this);

    /* Mac / desktop click. */
    this.el.addEventListener(
      'click',
      this.inspect
    );

    /* Incense ritual completion. */
    this.el.sceneEl.addEventListener(
      'offering-completed',
      this.onOfferingCompleted
    );

    this.setNormalLook();
  },


  /* ==========================================================
     NORMAL APPEARANCE
  ========================================================== */

  setNormalLook: function () {
    const surface = this.data.surface;
    const distortion = this.data.distortion;

    if (surface) {
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
    const surface = this.data.surface;
    const distortion = this.data.distortion;

    if (surface) {
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
  ========================================================== */

  onOfferingCompleted: function () {
    if (this.hasOfferingChanged) {
      return;
    }

    this.hasOfferingChanged = true;

    this.changeTimer = window.setTimeout(
      () => {
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
      900
    );
  },


  /* ==========================================================
     INSPECT
  ========================================================== */

  inspect: function (event) {
    if (window.roomsPaused) {
      return;
    }

    const now = performance.now();

    if (
      now - this.lastInspectTime <
      450
    ) {
      return;
    }

    this.lastInspectTime = now;

    if (
      event &&
      event.stopPropagation
    ) {
      event.stopPropagation();
    }

    this.runInspectionEffect();

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
  ========================================================== */

  runInspectionEffect: function () {
    const surface = this.data.surface;
    const distortion = this.data.distortion;

    if (
      this.isInspecting ||
      !surface
    ) {
      return;
    }

    this.isInspecting = true;

    if (
      !this.hasOfferingChanged
    ) {
      surface.setAttribute(
        'material',
        'emissiveIntensity',
        0.42
      );

      surface.setAttribute(
        'animation__mirrorinspect',
        `
          property: scale;
          from: 1 1 1;
          to: 1.012 0.992 1;
          dir: alternate;
          loop: 3;
          dur: 130;
          easing: easeInOutSine
        `
      );
    } else {
      surface.setAttribute(
        'material',
        'emissiveIntensity',
        0.75
      );

      surface.setAttribute(
        'animation__mirrorinspect',
        `
          property: scale;
          from: 1 1 1;
          to: 1.025 0.975 1;
          dir: alternate;
          loop: 5;
          dur: 85;
          easing: easeInOutSine
        `
      );

      if (distortion) {
        distortion.setAttribute(
          'visible',
          true
        );

        distortion.setAttribute(
          'animation__distort',
          `
            property: material.opacity;
            from: 0.03;
            to: 0.17;
            dir: alternate;
            loop: 5;
            dur: 90;
            easing: easeInOutSine
          `
        );
      }
    }

    if (this.inspectTimer) {
      window.clearTimeout(
        this.inspectTimer
      );
    }

    this.inspectTimer = window.setTimeout(
      () => {
        surface.removeAttribute(
          'animation__mirrorinspect'
        );

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

        if (distortion) {
          distortion.removeAttribute(
            'animation__distort'
          );

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

        this.isInspecting = false;
      },
      this.data.inspectionDuration
    );
  },


  /* ==========================================================
     IDLE HAUNTED MOVEMENT
  ========================================================== */

  tick: function (time) {
    if (
      window.roomsPaused ||
      !this.hasOfferingChanged ||
      this.isInspecting ||
      !this.data.distortion
    ) {
      return;
    }

    const seconds =
      time * 0.001;

    const speed =
      this.data.postOfferingPulseSpeed;

    const swayX =
      Math.sin(
        seconds * speed
      ) * 0.004;

    const swayY =
      Math.sin(
        seconds * 1.17 * speed +
        1.4
      ) * 0.0025;

    this.data.distortion.object3D.position.x =
      swayX;

    this.data.distortion.object3D.position.y =
      swayY;
  },


  /* ==========================================================
     CLEANUP
  ========================================================== */

  remove: function () {
    this.el.removeEventListener(
      'click',
      this.inspect
    );

    this.el.sceneEl.removeEventListener(
      'offering-completed',
      this.onOfferingCompleted
    );

    if (this.changeTimer) {
      window.clearTimeout(
        this.changeTimer
      );
    }

    if (this.inspectTimer) {
      window.clearTimeout(
        this.inspectTimer
      );
    }
  }
});


/* ============================================================
   QUEST MIRROR INTERACTION
============================================================ */

AFRAME.registerComponent('vr-mirror-interactor', {
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
      window.roomsPaused
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
      typeof event.detail.value === 'number'
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
    if (window.roomsPaused) {
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
});