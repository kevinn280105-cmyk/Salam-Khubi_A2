/* ============================================================
   SAFE / KEYPAD PUZZLE

   #safetybox (safetybox.glb) is a small standalone safe sitting
   near the TV. A floating numeric keypad spawns just above it.
   Punch in the 4-digit code shown on the TV screen while it's
   powered on (see the code-display panel added to embedded-tv
   in engine-interactions.js) and the safe door swings open.

   The code is generated once per page load; both the TV and the
   safe read the same value from window.getRoomsSafeCode() so
   they always agree.
============================================================ */

const ROOMS_SAFE_CODE_LENGTH = 4;

const ROOMS_SAFE_KEY_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clr', '0', null]
];

function getRoomsSafeCode() {
  if (!window.roomsSafeCode) {
    const digits = [];

    for (let i = 0; i < ROOMS_SAFE_CODE_LENGTH; i++) {
      digits.push(
        String(Math.floor(Math.random() * 10))
      );
    }

    window.roomsSafeCode = digits;
  }

  return window.roomsSafeCode;
}

window.getRoomsSafeCode = getRoomsSafeCode;


/* ------------------------------------------------------------
   CANVAS HELPERS

   Kept self-contained here (rather than reusing
   interaction-prompts.js's canvas helpers) so this file has no
   load-order dependency on it.
------------------------------------------------------------ */

function roomsSafeRoundedRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function roomsSafeCreateKeyTexture(label) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  roomsSafeRoundedRectPath(ctx, 6, 6, size - 12, size - 12, 16);
  ctx.fillStyle = 'rgba(20, 20, 24, 0.88)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(154, 160, 173, 0.85)';
  ctx.stroke();

  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 56px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function roomsSafeCreateDisplayTexture(entered, flash) {
  const width = 360;
  const height = 110;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  roomsSafeRoundedRectPath(ctx, 4, 4, width - 8, height - 8, 14);
  ctx.fillStyle = 'rgba(8, 8, 10, 0.92)';
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle =
    flash === 'bad'
      ? 'rgba(214, 68, 58, 0.95)'
      : flash === 'good'
        ? 'rgba(110, 214, 120, 0.95)'
        : 'rgba(154, 160, 173, 0.7)';
  ctx.stroke();

  const slots = [];

  for (let i = 0; i < ROOMS_SAFE_CODE_LENGTH; i++) {
    slots.push(
      entered[i] !== undefined ? entered[i] : '_'
    );
  }

  ctx.fillStyle =
    flash === 'bad'
      ? '#ff8a80'
      : flash === 'good'
        ? '#8dffa0'
        : '#7CFC90';
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(slots.join('  '), width / 2, height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function roomsSafeCreatePanelTexture() {
  const width = 340;
  const height = 400;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  roomsSafeRoundedRectPath(ctx, 4, 4, width - 8, height - 8, 20);
  ctx.fillStyle = 'rgba(14, 14, 16, 0.85)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(202, 164, 106, 0.55)';
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function roomsSafeApplyTexture(entity, texture) {
  const applyNow = () => {
    const mesh = entity.getObject3D('mesh');

    if (!mesh || !mesh.material) {
      entity.addEventListener('loaded', applyNow, { once: true });
      return;
    }

    /* Don't leak the outgoing GPU texture -- see engine-interactions.js's
       applyCodeTexture for why this matters. */
    if (mesh.material.map && mesh.material.map !== texture) {
      mesh.material.map.dispose();
    }

    mesh.material.map = texture;
    mesh.material.transparent = true;
    mesh.material.needsUpdate = true;
  };

  applyNow();
}


/* ============================================================
   EMBEDDED-SAFE

   Attached to #safetybox. Owns the entered-digit state, builds
   the floating keypad, and drives the door-open / wrong-code
   feedback directly on the loaded glb's own meshes.
============================================================ */

AFRAME.registerComponent(
  'embedded-safe',
  {
    init: function () {
      this.entered = [];
      this.isOpen = false;
      this.busy = false;

      this.doorMesh = null;
      this.keypadRoot = null;
      this.displayEntity = null;
      this.keyEntities = [];

      this.doorAnim = null;
      this.shakeAnim = null;
      this.shakeBase = new THREE.Vector3();

      this.onModelLoaded = this.onModelLoaded.bind(this);
      this.el.addEventListener('model-loaded', this.onModelLoaded);

      if (this.el.getObject3D('mesh')) {
        this.onModelLoaded();
      }
    },


    onModelLoaded: function () {
      const root = this.el.getObject3D('mesh');

      if (!root) {
        return;
      }

      root.updateMatrixWorld(true);

      /*
        safetybox.glb has two meshes: "Cube_Safe_0001" (the
        body) and "Cube001_Safe_0001" (a thin panel covering
        most of one face -- the door). Grabbing it directly by
        name lets the door swing open on its own without
        touching the rest of the box.
      */
      root.traverse((node) => {
        if (node.isMesh && node.name === 'Cube001_Safe_0001') {
          this.doorMesh = node;
        }
      });

      this.buildKeypad(root);

      console.log('Safe ready: safetybox.glb loaded, keypad built.');
    },


    buildKeypad: function (root) {
      if (this.keypadRoot) {
        return;
      }

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      /*
        Anchor the keypad just above the box. safetybox.glb's
        footprint is small (roughly half a meter on a side) so
        this keeps the pad right next to it no matter which way
        the box ends up facing in the room -- not live-tested,
        nudge the offsets below if it overlaps the model.
      */
      const worldPos = new THREE.Vector3(
        center.x,
        box.max.y + 0.24,
        center.z
      );

      const sceneObject = this.el.sceneEl.object3D;
      sceneObject.updateMatrixWorld(true);
      const localPos = sceneObject.worldToLocal(worldPos.clone());

      const wrapper = document.createElement('a-entity');
      wrapper.setAttribute('id', 'safetyKeypad');
      wrapper.setAttribute(
        'position',
        `${localPos.x} ${localPos.y} ${localPos.z}`
      );

      this.el.sceneEl.appendChild(wrapper);
      this.keypadRoot = wrapper;

      const panel = document.createElement('a-plane');
      panel.setAttribute('width', '0.40');
      panel.setAttribute('height', '0.46');
      panel.setAttribute(
        'material',
        'shader: flat; transparent: true; side: double; opacity: 0.96'
      );
      panel.setAttribute('position', '0 0.02 -0.01');
      wrapper.appendChild(panel);
      roomsSafeApplyTexture(panel, roomsSafeCreatePanelTexture());

      const display = document.createElement('a-plane');
      display.setAttribute('width', '0.32');
      display.setAttribute('height', '0.10');
      display.setAttribute(
        'material',
        'shader: flat; transparent: true; side: double'
      );
      display.setAttribute('position', '0 0.185 0.001');
      wrapper.appendChild(display);
      this.displayEntity = display;
      this.refreshDisplay();

      const step = 0.105;
      const keySize = 0.09;
      const startX = -step;
      const startY = 0.055;

      ROOMS_SAFE_KEY_LAYOUT.forEach((row, rowIndex) => {
        row.forEach((key, colIndex) => {
          if (key === null) {
            return;
          }

          const btn = document.createElement('a-plane');
          btn.setAttribute('width', String(keySize));
          btn.setAttribute('height', String(keySize));
          btn.setAttribute(
            'material',
            'shader: flat; transparent: true; side: double'
          );
          btn.setAttribute(
            'position',
            `${startX + colIndex * step} ${startY - rowIndex * step} 0.005`
          );
          btn.classList.add('safe-interactable');
          btn.setAttribute('data-safe-key', key);

          btn.addEventListener('click', (event) => {
            this.onKeyClick(event, key);
          });

          wrapper.appendChild(btn);
          this.keyEntities.push(btn);

          roomsSafeApplyTexture(
            btn,
            roomsSafeCreateKeyTexture(key === 'clr' ? 'CLR' : key)
          );
        });
      });
    },


    refreshDisplay: function (flash) {
      if (!this.displayEntity) {
        return;
      }

      roomsSafeApplyTexture(
        this.displayEntity,
        roomsSafeCreateDisplayTexture(this.entered, flash)
      );
    },


    onKeyClick: function (event, key) {
      if (event && event.stopPropagation) {
        event.stopPropagation();
      }

      this.press(key);
    },


    press: function (key) {
      if (this.isOpen || this.busy) {
        return;
      }

      if (
        typeof roomsGameplayInputLocked === 'function' &&
        roomsGameplayInputLocked()
      ) {
        return;
      }

      if (key === 'clr') {
        this.entered = [];
        this.refreshDisplay();
        return;
      }

      if (this.entered.length >= ROOMS_SAFE_CODE_LENGTH) {
        return;
      }

      this.entered.push(key);
      this.refreshDisplay();

      if (this.entered.length === ROOMS_SAFE_CODE_LENGTH) {
        this.checkCode();
      }
    },


    checkCode: function () {
      const code = getRoomsSafeCode();
      const matches = code.every(
        (digit, index) => digit === this.entered[index]
      );

      if (matches) {
        this.openSafe();
      } else {
        this.wrongCode();
      }
    },


    openSafe: function () {
      this.isOpen = true;
      this.refreshDisplay('good');

      if (this.doorMesh) {
        this.doorAnim = {
          start: performance.now(),
          duration: 500,
          from: this.doorMesh.rotation.y,
          to: this.doorMesh.rotation.y + Math.PI * 0.42
        };
      }

      this.el.emit('safe-opened', {}, false);

      if (this.el.sceneEl) {
        this.el.sceneEl.emit('safe-opened', {}, false);
      }

      console.log('Safe opened!');

      window.setTimeout(() => {
        if (this.keypadRoot && this.keypadRoot.parentNode) {
          this.keypadRoot.parentNode.removeChild(this.keypadRoot);
        }
      }, 1400);
    },


    wrongCode: function () {
      this.busy = true;
      this.refreshDisplay('bad');

      if (this.keypadRoot) {
        this.shakeBase.copy(this.keypadRoot.object3D.position);
        this.shakeAnim = {
          start: performance.now(),
          duration: 420
        };
      }

      window.setTimeout(() => {
        this.entered = [];
        this.busy = false;
        this.refreshDisplay();
      }, 500);
    },


    tick: function () {
      if (this.doorAnim && this.doorMesh) {
        const t = Math.min(
          1,
          (performance.now() - this.doorAnim.start) /
            this.doorAnim.duration
        );

        const eased = 1 - Math.pow(1 - t, 2);

        this.doorMesh.rotation.y =
          this.doorAnim.from +
          (this.doorAnim.to - this.doorAnim.from) * eased;

        if (t >= 1) {
          this.doorAnim = null;
        }
      }

      if (this.shakeAnim && this.keypadRoot) {
        const elapsed = performance.now() - this.shakeAnim.start;
        const t = elapsed / this.shakeAnim.duration;

        if (t >= 1) {
          this.keypadRoot.object3D.position.copy(this.shakeBase);
          this.shakeAnim = null;

        } else {
          const wobble =
            Math.sin(t * Math.PI * 6) * 0.01 * (1 - t);

          this.keypadRoot.object3D.position.set(
            this.shakeBase.x + wobble,
            this.shakeBase.y,
            this.shakeBase.z
          );
        }
      }
    },


    remove: function () {
      this.el.removeEventListener('model-loaded', this.onModelLoaded);

      if (this.keypadRoot && this.keypadRoot.parentNode) {
        this.keypadRoot.parentNode.removeChild(this.keypadRoot);
      }
    }
  }
);


/* ============================================================
   VR SAFE INTERACTION

   Same trigger-based pattern as vr-tv-interactor /
   vr-offering-table-smoke-interactor: attached to #rightHand,
   no-ops unless the ray is actually hitting one of the keypad
   buttons, so it coexists fine with the other trigger-driven
   interactors already on that hand.
============================================================ */

AFRAME.registerComponent(
  'vr-safe-interactor',
  {
    schema: {
      pressThreshold: { default: 0.65 },
      releaseThreshold: { default: 0.2 }
    },


    init: function () {
      this.triggerHeld = false;

      this.pressTrigger = this.pressTrigger.bind(this);
      this.releaseTrigger = this.releaseTrigger.bind(this);
      this.onTriggerChanged = this.onTriggerChanged.bind(this);

      this.el.addEventListener('triggerdown', this.pressTrigger);
      this.el.addEventListener('triggerup', this.releaseTrigger);
      this.el.addEventListener('triggerchanged', this.onTriggerChanged);
      this.el.addEventListener(
        'controllerdisconnected',
        this.releaseTrigger
      );
    },


    pressTrigger: function () {
      if (this.triggerHeld) {
        return;
      }

      this.triggerHeld = true;
      this.useSafeKeypad();
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
        value >= this.data.pressThreshold &&
        !this.triggerHeld
      ) {
        this.pressTrigger();

      } else if (value <= this.data.releaseThreshold) {
        this.releaseTrigger();
      }
    },


    useSafeKeypad: function () {
      if (
        typeof roomsGameplayInputLocked === 'function' &&
        roomsGameplayInputLocked()
      ) {
        return false;
      }

      const raycaster = this.el.components.raycaster;

      if (!raycaster) {
        return false;
      }

      if (raycaster.refreshObjects) {
        raycaster.refreshObjects();
      }

      const safetybox = document.querySelector('#safetybox');
      const safeComponent =
        safetybox && safetybox.components['embedded-safe'];

      if (!safeComponent) {
        return false;
      }

      const intersectedEls = raycaster.intersectedEls || [];

      for (let i = 0; i < intersectedEls.length; i++) {
        const candidate = intersectedEls[i];

        if (
          candidate &&
          candidate.hasAttribute &&
          candidate.hasAttribute('data-safe-key')
        ) {
          const key = candidate.getAttribute('data-safe-key');
          safeComponent.press(key);
          return true;
        }
      }

      return false;
    },


    remove: function () {
      this.el.removeEventListener('triggerdown', this.pressTrigger);
      this.el.removeEventListener('triggerup', this.releaseTrigger);
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
============================================================ */

function setupSafetyBoxInteractions() {
  const rightHand = document.querySelector('#rightHand');
  const cursor = document.querySelector('a-cursor');

  if (typeof appendRaycasterObjectSelector === 'function') {
    appendRaycasterObjectSelector(rightHand, '.safe-interactable');
    appendRaycasterObjectSelector(cursor, '.safe-interactable');
  }

  if (
    rightHand &&
    !rightHand.hasAttribute('vr-safe-interactor')
  ) {
    rightHand.setAttribute('vr-safe-interactor', '');
  }

  console.log(
    'Safe interactions ready: safetybox.glb keypad wired up.'
  );
}


window.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');

  if (!scene) {
    return;
  }

  if (scene.hasLoaded) {
    setupSafetyBoxInteractions();

  } else {
    scene.addEventListener(
      'loaded',
      setupSafetyBoxInteractions,
      { once: true }
    );
  }
});
