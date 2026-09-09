/* ============================================================
   ENDING SEQUENCE

   Runs once, kicked off by story.js's onPlayerSatOppositeGhost()
   after the closing dialogue lines have had time to be read.
   Replaces the old "GAME COMPLETE" screen entirely:

     1. #sittingFigure (the ghost) fades out and disappears.
     2. The door leaf that was coded to always stay shut (see
        engine-interactions.js door-hinge activatePart(),
        part.name === 'Sketchfab_model') opens on its own.
     3. Once the player actually walks through that doorway, the
        screen fades to black.
     4. While the screen is black, the whole game state resets
        (same reset restartRoomsWithin() already does) and the
        main menu title screen reappears, ready for a fresh
        playthrough.

   Call window.roomsStartEndingSequence() to start this. Safe to
   call more than once in a session -- only the first call (per
   playthrough) does anything; it re-arms itself once the return
   to the main menu completes, so it works again next playthrough.
============================================================ */

const ROOMS_ENDING_CONFIG = {
  ghostFadeMs: 1500,
  doorOpenDelayAfterGhostMs: 400,
  crossCheckInterval: 80,
  doorCrossPadding: 0.35,
  maxDoorCrossDistance: 1.5,
  fadeToBlackMs: 900,
  holdBlackMs: 650
};


let roomsEndingStarted = false;


/* ============================================================
   GENERIC GLTF MODEL FADE-OUT

   Clones each mesh's material before touching opacity so this
   never accidentally fades something else that happens to share
   the same material resource.
============================================================ */

function roomsFadeOutModelEntity(entity, durationMs) {
  return new Promise((resolve) => {
    if (!entity) {
      resolve();
      return;
    }

    const root = entity.getObject3D('mesh');

    if (!root) {
      entity.setAttribute('visible', false);
      resolve();
      return;
    }

    const materials = [];

    root.traverse((node) => {
      if (node.isMesh && node.material) {
        const original = Array.isArray(node.material)
          ? node.material
          : [node.material];

        const cloned = original.map((mat) => mat.clone());

        node.material = Array.isArray(node.material)
          ? cloned
          : cloned[0];

        cloned.forEach((mat) => {
          mat.transparent = true;

          if (typeof mat.opacity !== 'number') {
            mat.opacity = 1;
          }

          materials.push(mat);
        });
      }
    });

    if (!materials.length) {
      entity.setAttribute('visible', false);
      resolve();
      return;
    }

    const started = performance.now();
    const length = Math.max(1, Number(durationMs) || 1);

    const step = (now) => {
      const progress = THREE.MathUtils.clamp(
        (now - started) / length,
        0,
        1
      );

      const opacity = 1 - progress;

      materials.forEach((mat) => {
        mat.opacity = opacity;
      });

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        entity.setAttribute('visible', false);
        resolve();
      }
    };

    window.requestAnimationFrame(step);
  });
}


AFRAME.registerComponent(
  'rooms-ending-sequence',
  {
    init: function () {
      this.watchingDoor = false;
      this.lastCheck = 0;

      this.previousPlayerPos = new THREE.Vector3();
      this.currentPlayerPos = new THREE.Vector3();

      this.doorBox = null;
      this.doorCenter = null;
      this.doorNormalAxis = null;
      this.doorLateralAxis = null;

      this.blackout = null;
      this.blackoutOpacity = 0;
      this.blackoutAnimationFrame = null;

      window.roomsStartEndingSequence = () => this.start();
    },

    start: async function () {
      if (roomsEndingStarted) {
        return;
      }

      roomsEndingStarted = true;

      console.log('ENDING: sequence started -- ghost fading out.');

      const ghost = document.querySelector('#sittingFigure');

      await roomsFadeOutModelEntity(
        ghost,
        ROOMS_ENDING_CONFIG.ghostFadeMs
      );

      await new Promise((resolve) => {
        window.setTimeout(
          resolve,
          ROOMS_ENDING_CONFIG.doorOpenDelayAfterGhostMs
        );
      });

      this.openExitDoor();
      this.armDoorWatch();
    },

    /* ========================================================
       OPEN THE PREVIOUSLY-LOCKED DOOR LEAF
    ======================================================== */

    openExitDoor: function () {
      const door = document.querySelector('#door');
      const hinge = door && door.components['door-hinge'];

      if (!hinge) {
        console.warn('ENDING: door-hinge component not found.');
        return;
      }

      const lockedPart = hinge.parts.find(
        (part) => part.name === 'Sketchfab_model'
      );

      if (!lockedPart) {
        console.warn('ENDING: locked door part not found.');
        return;
      }

      /*
        Capture the doorway plane BEFORE opening -- createState()
        reparents the part under a hinge pivot, and the animation
        itself moves it, so this has to happen first.
      */
      door.object3D.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(lockedPart);

      if (!box.isEmpty()) {
        this.doorBox = box;

        const size = new THREE.Vector3();
        box.getSize(size);

        if (size.x <= size.z) {
          this.doorNormalAxis = 'x';
          this.doorLateralAxis = 'z';
        } else {
          this.doorNormalAxis = 'z';
          this.doorLateralAxis = 'x';
        }

        this.doorCenter = new THREE.Vector3();
        box.getCenter(this.doorCenter);
      }

      const state = hinge.createState(lockedPart);

      hinge.startDoorAnimation(state, true, true);

      console.log('ENDING: exit door opened on its own.');
    },

    /* ========================================================
       WATCH FOR THE PLAYER WALKING THROUGH IT
    ======================================================== */

    armDoorWatch: function () {
      if (!this.doorBox) {
        /*
          Could not read the doorway geometry -- fall back to a
          flat delay so the ending still completes instead of
          hanging forever.
        */
        window.setTimeout(
          () => this.runFadeAndReturnToMenu(),
          6000
        );
        return;
      }

      if (typeof roomsMonsterPlayerPosition === 'function') {
        roomsMonsterPlayerPosition(this.previousPlayerPos);
      }

      this.watchingDoor = true;
    },

    tick: function (time) {
      if (!this.watchingDoor) {
        return;
      }

      if (time - this.lastCheck < ROOMS_ENDING_CONFIG.crossCheckInterval) {
        return;
      }

      this.lastCheck = time;

      if (typeof roomsMonsterPlayerPosition !== 'function') {
        return;
      }

      roomsMonsterPlayerPosition(this.currentPlayerPos);

      if (this.didCrossDoorway(this.previousPlayerPos, this.currentPlayerPos)) {
        this.watchingDoor = false;
        this.runFadeAndReturnToMenu();
      }

      this.previousPlayerPos.copy(this.currentPlayerPos);
    },

    /*
      Same "did movement cross the doorway plane" algorithm as
      monster.js's didCrossDoorway(), scoped to this specific
      door leaf's captured box instead of the bedroom doorway.
    */
    didCrossDoorway: function (previous, current) {
      if (!previous || !current || !this.doorNormalAxis || !this.doorLateralAxis) {
        return false;
      }

      const normalAxis = this.doorNormalAxis;
      const lateralAxis = this.doorLateralAxis;

      const previousNormal = previous[normalAxis] - this.doorCenter[normalAxis];
      const currentNormal = current[normalAxis] - this.doorCenter[normalAxis];

      if (previousNormal * currentNormal > 0) {
        return false;
      }

      const normalDelta = currentNormal - previousNormal;

      if (Math.abs(normalDelta) < 0.00001) {
        return false;
      }

      const horizontalDistance = Math.hypot(
        current.x - previous.x,
        current.z - previous.z
      );

      if (horizontalDistance > ROOMS_ENDING_CONFIG.maxDoorCrossDistance) {
        return false;
      }

      const t = -previousNormal / normalDelta;

      if (t < 0 || t > 1) {
        return false;
      }

      const crossingLateral = THREE.MathUtils.lerp(
        previous[lateralAxis],
        current[lateralAxis],
        t
      );

      const minimum = this.doorBox.min[lateralAxis] - ROOMS_ENDING_CONFIG.doorCrossPadding;
      const maximum = this.doorBox.max[lateralAxis] + ROOMS_ENDING_CONFIG.doorCrossPadding;

      return Boolean(crossingLateral >= minimum && crossingLateral <= maximum);
    },

    /* ========================================================
       FADE TO BLACK, RESET, BACK TO MAIN MENU
    ======================================================== */

    runFadeAndReturnToMenu: async function () {
      console.log('ENDING: player walked through the door.');

      await this.fadeBlackout(1, ROOMS_ENDING_CONFIG.fadeToBlackMs);

      await new Promise((resolve) => {
        window.setTimeout(resolve, ROOMS_ENDING_CONFIG.holdBlackMs);
      });

      if (typeof window.exitRoomsWithin === 'function') {
        try {
          await window.exitRoomsWithin();
        } catch (error) {
          console.error('ENDING: could not exit VR/fullscreen:', error);
        }
      }

      if (typeof window.restartRoomsWithin === 'function') {
        window.restartRoomsWithin();
      }

      this.showMainMenuAgain();

      if (this.blackout) {
        roomsSetVisible(this.blackout, false);
      }

      roomsEndingStarted = false;

      console.log('ENDING: back at the main menu, ready for a fresh playthrough.');
    },

    showMainMenuAgain: function () {
      /*
        roomsMainMenuStarted lives in ui-scare.js as a top-level
        `let` -- classic (non-module) scripts on the same page
        share one global lexical scope, so this bare assignment
        reaches it directly, same as roomsPromptState is reached
        from ui-scare.js's restart helpers.
      */
      roomsMainMenuStarted = false;

      const overlay = document.querySelector('#mainMenuOverlay');

      if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('is-hidden');

        void overlay.offsetWidth;

        overlay.classList.remove('is-hidden');
      }

      const video = document.querySelector('#mainMenuVideo');

      if (video) {
        try {
          video.currentTime = 0;
          video.play();
        } catch (error) {
          /* ignore -- cosmetic only */
        }
      }
    },

    /* ========================================================
       BLACKOUT OVERLAY

       Same camera-attached full-screen plane pattern as
       monster.js's createStandingBlackout(), independent copy
       since this one belongs to a completely separate sequence.
    ======================================================== */

    createBlackout: function () {
      const camera = document.querySelector('#cam') || document.querySelector('[camera]');

      if (!camera) {
        return false;
      }

      let blackout = document.querySelector('#roomsEndingBlackout');

      if (!blackout) {
        blackout = document.createElement('a-plane');
        blackout.setAttribute('id', 'roomsEndingBlackout');
        blackout.setAttribute('position', '0 0 -0.1');
        blackout.setAttribute('width', '4');
        blackout.setAttribute('height', '4');
        blackout.setAttribute('visible', 'false');

        blackout.setAttribute(
          'material',
          'color: #000000; opacity: 0; transparent: true; shader: flat; ' +
            'depthTest: false; depthWrite: false; side: double'
        );

        camera.appendChild(blackout);
      }

      this.blackout = blackout;

      return true;
    },

    fadeBlackout: function (targetOpacity, duration) {
      return new Promise((resolve) => {
        if (!this.blackout) {
          this.createBlackout();
        }

        if (!this.blackout) {
          resolve();
          return;
        }

        roomsSetVisible(this.blackout, true);

        if (this.blackoutAnimationFrame !== null) {
          window.cancelAnimationFrame(this.blackoutAnimationFrame);
          this.blackoutAnimationFrame = null;
        }

        const from = this.blackoutOpacity;
        const to = THREE.MathUtils.clamp(Number(targetOpacity) || 0, 0, 1);
        const length = Math.max(1, Number(duration) || 1);
        const started = performance.now();

        const step = (now) => {
          const progress = THREE.MathUtils.clamp((now - started) / length, 0, 1);
          const value = THREE.MathUtils.lerp(from, to, progress);

          this.blackoutOpacity = value;

          this.blackout.setAttribute('material', 'opacity', value);

          if (progress < 1) {
            this.blackoutAnimationFrame = window.requestAnimationFrame(step);
          } else {
            this.blackoutAnimationFrame = null;
            resolve();
          }
        };

        this.blackoutAnimationFrame = window.requestAnimationFrame(step);
      });
    }
  }
);
