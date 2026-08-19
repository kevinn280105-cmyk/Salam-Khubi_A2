/* ============================================================
   incense.js — ROOMS WITHIN
   Full replacement.

   Keeps the existing incense ritual and adds a temporary
   interaction to bantho.glb:
   - Mac: aim at bantho + click
   - Quest: right controller laser + trigger
   - Result: incense smoke rises from the top of bantho for ~4.2s
============================================================ */

function ritualIsImmersiveXR(scene) {
  return Boolean(scene && scene.renderer && scene.renderer.xr && scene.renderer.xr.isPresenting);
}

function ritualIsPaused() {
  return Boolean(window.roomsPaused || window.roomsInputLocked);
}

function ritualWait(ms) {
  if (window.waitRoomsMilliseconds) return window.waitRoomsMilliseconds(ms);

  return new Promise((resolve) => {
    let remaining = Math.max(0, Number(ms) || 0);
    let previous = performance.now();

    function step(now) {
      const elapsed = Math.max(0, now - previous);
      previous = now;
      if (!ritualIsPaused()) remaining -= elapsed;
      if (remaining <= 0) return resolve();
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
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
  const wanted = keywords.map(ritualNormalizeName);
  let found = null;

  root.traverse((node) => {
    if (found) return;
    const names = [node.name || ''];
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((m) => {
        if (m && m.name) names.push(m.name);
      });
    }
    const combined = ritualNormalizeName(names.join(' '));
    if (wanted.some((key) => combined.includes(key))) found = node;
  });

  return found;
}

function ritualWorldBox(object) {
  if (!object) return null;
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return box.isEmpty() ? null : box;
}

function ritualWorldCenter(object) {
  const box = ritualWorldBox(object);
  return box ? box.getCenter(new THREE.Vector3()) : null;
}

function ritualObjectBelongsToEntity(hitObject, entity) {
  if (!hitObject || !entity) return false;
  const root = entity.getObject3D('mesh');
  if (!root) return false;

  let current = hitObject;

  while (current) {
    if (current === root) return true;
    current = current.parent;
  }

  return false;
}

function ritualAppendRaycasterSelector(entity, selector) {
  if (!entity || !selector) return;

  const data = entity.getAttribute('raycaster') || {};

  const list = String(data.objects || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  if (!list.includes(selector)) {
    list.push(selector);
  }

  entity.setAttribute(
    'raycaster',
    'objects',
    list.join(', ')
  );

  const raycaster = entity.components.raycaster;

  if (raycaster && raycaster.refreshObjects) {
    raycaster.refreshObjects();
  }
}


/* ============================================================
   SMOKE
============================================================ */

AFRAME.registerComponent('incense-smoke', {
  schema: {
    active: { default: false },
    count: { default: 18 },
    height: { default: 1.15 },
    speed: { default: 0.14 },
    width: { default: 0.11 },
    opacity: { default: 0.22 },
    size: { default: 0.045 },
    color: { default: '#d0d0d0' }
  },

  init: function () {
    this.puffs = [];
    this.tipWorld = new THREE.Vector3();
    this.sceneObject = this.el.sceneEl.object3D;
    this.paused = false;
    this.texture = this.makeTexture();

    this.onPause = (event) => {
      this.paused = Boolean(
        event &&
        event.detail &&
        event.detail.paused
      );
    };

    this.el.sceneEl.addEventListener(
      'rooms-pause-changed',
      this.onPause
    );

    this.makePuffs();
  },

  makeTexture: function () {
    const canvas = document.createElement('canvas');

    canvas.width = 128;
    canvas.height = 128;

    const ctx = canvas.getContext('2d');

    const g = ctx.createRadialGradient(
      64,
      64,
      2,
      64,
      64,
      61
    );

    g.addColorStop(
      0,
      'rgba(235,235,235,0.78)'
    );

    g.addColorStop(
      0.20,
      'rgba(220,220,220,0.55)'
    );

    g.addColorStop(
      0.48,
      'rgba(200,200,200,0.26)'
    );

    g.addColorStop(
      0.78,
      'rgba(175,175,175,0.08)'
    );

    g.addColorStop(
      1,
      'rgba(160,160,160,0)'
    );

    ctx.fillStyle = g;

    ctx.fillRect(
      0,
      0,
      128,
      128
    );

    return new THREE.CanvasTexture(canvas);
  },

  makePuffs: function () {
    for (let i = 0; i < this.data.count; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.texture,
        color: new THREE.Color(this.data.color),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true
      });

      const sprite = new THREE.Sprite(material);

      sprite.visible = false;
      sprite.renderOrder = 20;

      this.sceneObject.add(sprite);

      this.puffs.push({
        sprite,
        material,
        life: -(i / Math.max(this.data.count, 1)),
        phase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 2,
        driftZ: (Math.random() - 0.5) * 2,
        sizeSeed: 0.72 + Math.random() * 0.58,
        rotationSpeed: (Math.random() - 0.5) * 0.34,
        opacitySeed: 0.82 + Math.random() * 0.25
      });
    }
  },

  restartPuffs: function () {
    this.puffs.forEach((p, i) => {
      p.life =
        -(
          i /
          Math.max(this.puffs.length, 1)
        ) * 0.42;

      p.phase =
        Math.random() *
        Math.PI *
        2;

      p.driftX =
        (Math.random() - 0.5) *
        2;

      p.driftZ =
        (Math.random() - 0.5) *
        2;

      p.sprite.visible = false;
      p.material.opacity = 0;
    });
  },

  hideAll: function () {
    this.puffs.forEach((p) => {
      p.sprite.visible = false;
      p.material.opacity = 0;
    });
  },

  update: function (oldData) {
    if (!this.data.active) {
      this.hideAll();
    }

    if (
      oldData &&
      oldData.color &&
      oldData.color !== this.data.color
    ) {
      const color =
        new THREE.Color(
          this.data.color
        );

      this.puffs.forEach((p) => {
        p.material.color.copy(color);
      });
    }
  },

  tick: function (time, deltaTime) {
    if (
      !this.data.active ||
      !deltaTime ||
      this.paused ||
      ritualIsPaused()
    ) {
      return;
    }

    this.el.object3D.getWorldPosition(
      this.tipWorld
    );

    const dt =
      Math.min(
        deltaTime / 1000,
        0.05
      );

    const t =
      time * 0.001;

    this.puffs.forEach((p) => {
      p.life +=
        dt *
        this.data.speed *
        1.35;

      if (p.life > 1) {
        p.life = 0;

        p.phase =
          Math.random() *
          Math.PI *
          2;

        p.driftX =
          (Math.random() - 0.5) *
          2;

        p.driftZ =
          (Math.random() - 0.5) *
          2;
      }

      if (p.life < 0) {
        p.sprite.visible = false;
        return;
      }

      const life = p.life;

      const middle =
        THREE.MathUtils.smoothstep(
          life,
          0.20,
          0.72
        );

      const upper =
        THREE.MathUtils.smoothstep(
          life,
          0.58,
          1
        );

      const x =
        Math.sin(
          t * 0.95 +
          life * 8.6 +
          p.phase
        ) *
          this.data.width *
          0.52 *
          middle +

        p.driftX *
          this.data.width *
          0.42 *
          upper +

        Math.sin(
          t * 1.55 +
          life * 14.5 +
          p.phase * 1.8
        ) *
          this.data.width *
          0.18 *
          upper;

      const z =
        Math.cos(
          t * 0.78 +
          life * 7.1 +
          p.phase * 1.35
        ) *
          this.data.width *
          0.36 *
          middle +

        p.driftZ *
          this.data.width *
          0.34 *
          upper +

        Math.cos(
          t * 1.35 +
          life * 12.4 +
          p.phase * 1.15
        ) *
          this.data.width *
          0.15 *
          upper;

      p.sprite.position.set(
        this.tipWorld.x + x,
        this.tipWorld.y +
          life *
          this.data.height,
        this.tipWorld.z + z
      );

      const scale =
        this.data.size *
        p.sizeSeed *
        (
          0.56 +
          life *
          2.65
        );

      p.sprite.scale.set(
        scale,
        scale *
          (
            1.28 +
            upper *
            0.24
          ),
        1
      );

      p.material.rotation =
        p.phase +
        t *
        p.rotationSpeed;

      const fadeIn =
        THREE.MathUtils.smoothstep(
          life,
          0,
          0.075
        );

      const fadeOut =
        1 -
        THREE.MathUtils.smoothstep(
          life,
          0.60,
          1
        );

      p.material.opacity =
        this.data.opacity *
        fadeIn *
        fadeOut *
        p.opacitySeed;

      p.sprite.visible =
        p.material.opacity >
        0.002;
    });
  },

  remove: function () {
    this.el.sceneEl.removeEventListener(
      'rooms-pause-changed',
      this.onPause
    );

    this.puffs.forEach((p) => {
      this.sceneObject.remove(
        p.sprite
      );

      p.material.dispose();
    });

    if (this.texture) {
      this.texture.dispose();
    }
  }
});


/* ============================================================
   OFFERING LAYOUT
============================================================ */

AFRAME.registerComponent('offering-layout', {
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
      this.applyLayout.bind(this);

    const altar =
      this.data.altar;

    if (!altar) {
      console.warn(
        'Offering layout: #bantho not found.'
      );

      return;
    }

    altar.addEventListener(
      'model-loaded',
      this.applyLayout
    );

    if (
      altar.getObject3D('mesh')
    ) {
      this.applyLayout();
    }
  },

  setWorldPosition: function (
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

    parent.updateMatrixWorld(true);

    entity.object3D.position.copy(
      parent.worldToLocal(
        worldPosition.clone()
      )
    );
  },

  applyLayout: function () {
    const root =
      this.data.altar &&
      this.data.altar.getObject3D(
        'mesh'
      );

    if (!root) {
      return;
    }

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

    const surfaceY =
      altarBox.min.y +
      size.y *
      this.data.surfaceRatio;

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

    let bowlPosition =
      new THREE.Vector3(
        center.x,
        surfaceY + 0.035,
        center.z +
        this.data.frontOffset
      );

    if (bowlObject) {
      const box =
        ritualWorldBox(
          bowlObject
        );

      bowlPosition =
        box
          ? new THREE.Vector3(
              (
                box.min.x +
                box.max.x
              ) / 2,

              box.max.y +
              0.015,

              (
                box.min.z +
                box.max.z
              ) / 2
            )
          : ritualWorldCenter(
              bowlObject
            );
    }

    let flamePosition =
      new THREE.Vector3(
        center.x +
        size.x *
        this.data.flameSide,

        surfaceY +
        0.12,

        center.z +
        this.data.frontOffset
      );

    if (flameObject) {
      const box =
        ritualWorldBox(
          flameObject
        );

      flamePosition =
        box
          ? new THREE.Vector3(
              (
                box.min.x +
                box.max.x
              ) / 2,

              box.max.y +
              0.025,

              (
                box.min.z +
                box.max.z
              ) / 2
            )
          : ritualWorldCenter(
              flameObject
            );
    }

    const pickup =
      new THREE.Vector3(
        center.x +
        size.x *
        this.data.pickupSide,

        surfaceY +
        0.055,

        center.z +
        this.data.frontOffset
      );

    this.setWorldPosition(
      document.querySelector(
        '#incenseBowlZone'
      ),
      bowlPosition
    );

    this.setWorldPosition(
      document.querySelector(
        '#incensePlacedPoint'
      ),

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

    this.setWorldPosition(
      document.querySelector(
        '#incenseFlameZone'
      ),
      flamePosition
    );

    this.setWorldPosition(
      document.querySelector(
        '#incenseFlameVisual'
      ),
      flamePosition
    );

    const incense =
      document.querySelector(
        '#incenseStick'
      );

    this.setWorldPosition(
      incense,
      pickup
    );

    if (
      incense &&
      !(
        incense.is &&
        incense.is('grabbed')
      )
    ) {
      incense.object3D.rotation.set(
        0,
        0,
        THREE.MathUtils.degToRad(
          90
        )
      );
    }

    const flameVisual =
      document.querySelector(
        '#incenseFlameVisual'
      );

    if (flameVisual) {
      flameVisual.setAttribute(
        'visible',
        Boolean(
          this.data.temporaryFlame &&
          !flameObject
        )
      );
    }

    const opacity =
      this.data.debugVisible
        ? 0.25
        : 0;

    const bowlZone =
      document.querySelector(
        '#incenseBowlZone'
      );

    const flameZone =
      document.querySelector(
        '#incenseFlameZone'
      );

    if (bowlZone) {
      bowlZone.setAttribute(
        'material',
        `
          color: #00ff88;
          opacity: ${opacity};
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
          opacity: ${opacity};
          transparent: true;
          depthWrite: false
        `
      );
    }
  },

  remove: function () {
    if (this.data.altar) {
      this.data.altar.removeEventListener(
        'model-loaded',
        this.applyLayout
      );
    }
  }
});


/* ============================================================
   INCENSE RITUAL
============================================================ */

AFRAME.registerComponent('incense-offering', {
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
    this.state = 'unlit';
    this.bowCount = 0;
    this.lightProgress = 0;
    this.bowWasDown = false;
    this.lastBowTime = 0;
    this.completed = false;

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
      this.onKeyDown.bind(this);

    window.addEventListener(
      'keydown',
      this.onKeyDown
    );

    if (this.data.ember) {
      this.data.ember.setAttribute(
        'visible',
        false
      );
    }

    if (this.data.tipFlame) {
      this.data.tipFlame.setAttribute(
        'visible',
        false
      );
    }

    if (this.data.tip) {
      this.data.tip.setAttribute(
        'incense-smoke',
        'active',
        false
      );
    }
  },

  isHeld: function () {
    return Boolean(
      this.el.is &&
      this.el.is('grabbed')
    );
  },

  isLit: function () {
    return (
      this.state === 'lit' ||
      this.state === 'placed'
    );
  },

  onKeyDown: function (event) {
    if (ritualIsPaused()) {
      return;
    }

    if (
      String(
        event.key || ''
      ).toLowerCase() === 'b' &&

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

  getHeadDownAngle: function () {
    const camera =
      document.querySelector(
        '#cam'
      );

    if (!camera) {
      return 0;
    }

    camera.object3D.getWorldQuaternion(
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

    return THREE.MathUtils.radToDeg(
      Math.asin(
        THREE.MathUtils.clamp(
          -this.forward.y,
          -1,
          1
        )
      )
    );
  },

  registerBow: function () {
    if (ritualIsPaused()) {
      return;
    }

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

    this.lastBowTime = now;
    this.bowCount++;

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
      this.el.emit(
        'offering-bows-completed',
        {},
        false
      );
    }
  },

  lightIncense: function () {
    if (
      this.state !== 'unlit' ||
      ritualIsPaused()
    ) {
      return;
    }

    this.state = 'lit';
    this.lightProgress = 0;

    if (this.data.ember) {
      this.data.ember.setAttribute(
        'visible',
        true
      );
    }

    if (this.data.tipFlame) {
      this.data.tipFlame.setAttribute(
        'visible',
        true
      );

      ritualWait(
        450
      ).then(() => {
        if (this.data.tipFlame) {
          this.data.tipFlame.setAttribute(
            'visible',
            false
          );
        }
      });
    }

    if (this.data.tip) {
      this.data.tip.setAttribute(
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
  },

  updateLighting: function (
    deltaTime
  ) {
    if (
      ritualIsPaused() ||
      this.state !== 'unlit' ||
      !this.isHeld() ||
      !this.data.tip ||
      !this.data.flameZone
    ) {
      this.lightProgress = 0;
      return;
    }

    this.data.tip.object3D.getWorldPosition(
      this.tipWorld
    );

    this.data.flameZone.object3D.getWorldPosition(
      this.flameWorld
    );

    if (
      this.tipWorld.distanceTo(
        this.flameWorld
      ) <=
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
      this.lightProgress = 0;
    }
  },

  updateBowDetection: function () {
    if (
      ritualIsPaused() ||
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

    const angle =
      this.getHeadDownAngle();

    if (
      !this.bowWasDown &&
      angle >=
      this.data.bowDownAngle
    ) {
      this.bowWasDown = true;
    } else if (
      this.bowWasDown &&
      angle <=
      this.data.bowUpAngle
    ) {
      this.bowWasDown = false;
      this.registerBow();
    }
  },

  updatePlacement: function () {
    if (
      ritualIsPaused() ||
      !this.isLit() ||
      this.completed ||
      !this.isHeld() ||
      !this.data.base ||
      !this.data.bowlZone
    ) {
      return;
    }

    this.data.base.object3D.getWorldPosition(
      this.baseWorld
    );

    this.data.bowlZone.object3D.getWorldPosition(
      this.bowlWorld
    );

    if (
      this.baseWorld.distanceTo(
        this.bowlWorld
      ) >
      this.data.placeDistance
    ) {
      return;
    }

    if (
      this.bowCount <
      this.data.requiredBows
    ) {
      return;
    }

    this.placeIncense();
  },

  detachFromHolder: function () {
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
        hand.heldItem = null;
        hand.gripHeld = false;
      }
    }

    if (
      grabbable.reparentPreserveWorld
    ) {
      grabbable.reparentPreserveWorld(
        this.el.sceneEl.object3D
      );
    } else {
      this.el.sceneEl.object3D.attach(
        this.el.object3D
      );
    }

    grabbable.heldBy = null;
    grabbable.isMoving = false;

    if (grabbable.velocity) {
      grabbable.velocity.set(
        0,
        0,
        0
      );
    }

    if (
      this.el.is &&
      this.el.is('grabbed')
    ) {
      this.el.removeState(
        'grabbed'
      );
    }
  },

  placeIncense: function () {
    if (
      this.completed ||
      !this.data.placedPoint ||
      ritualIsPaused()
    ) {
      return;
    }

    this.detachFromHolder();

    const pos =
      new THREE.Vector3();

    const quat =
      new THREE.Quaternion();

    this.data.placedPoint.object3D.getWorldPosition(
      pos
    );

    this.data.placedPoint.object3D.getWorldQuaternion(
      quat
    );

    this.el.object3D.position.copy(
      pos
    );

    this.el.object3D.quaternion.copy(
      quat
    );

    this.state = 'placed';
    this.completed = true;

    this.el.classList.remove(
      'item'
    );

    this.el.classList.remove(
      'interactable'
    );

    this.el.removeAttribute(
      'natural-grabbable'
    );

    const detail = {
      bows:
        this.bowCount,

      requiredBows:
        this.data.requiredBows
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

    if (story) {
      story.emit(
        'offering-completed',
        detail,
        false
      );
    }
  },

  tick: function (
    time,
    deltaTime
  ) {
    if (
      !deltaTime ||
      this.completed ||
      ritualIsPaused()
    ) {
      return;
    }

    this.updateLighting(
      deltaTime
    );

    this.updateBowDetection();

    this.updatePlacement();
  },

  remove: function () {
    window.removeEventListener(
      'keydown',
      this.onKeyDown
    );
  }
});


/* ============================================================
   BLACKOUT AFTER FULL RITUAL
============================================================ */

AFRAME.registerComponent('offering-blackout', {
  schema: {
    delay: {
      default: 1400
    },

    blackoutDuration: {
      default: 1900
    }
  },

  init: function () {
    this.hasRun = false;
    this.lightStates = [];
    this.tvWasOn = false;
    this.tvComponent = null;

    this.onOfferingCompleted =
      this.onOfferingCompleted.bind(
        this
      );

    this.el.sceneEl.addEventListener(
      'offering-completed',
      this.onOfferingCompleted
    );
  },

  captureLights: function () {
    this.lightStates = [];

    this.el.sceneEl
      .querySelectorAll(
        '[light]'
      )
      .forEach(
        (entity) => {
          this.lightStates.push({
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

  lightsOff: function () {
    this.lightStates.forEach(
      (state) => {
        if (
          state.entity.hasAttribute(
            'flicker'
          )
        ) {
          state.entity.removeAttribute(
            'flicker'
          );
        }

        state.entity.setAttribute(
          'light',
          'intensity',
          0
        );
      }
    );
  },

  lightsOn: function () {
    this.lightStates.forEach(
      (state) => {
        if (
          !state.entity.isConnected
        ) {
          return;
        }

        state.entity.setAttribute(
          'light',
          state.light
        );

        if (
          state.hadFlicker &&
          state.flicker
        ) {
          state.entity.setAttribute(
            'flicker',
            state.flicker
          );
        }
      }
    );
  },

  onOfferingCompleted:
    async function () {
      if (this.hasRun) {
        return;
      }

      this.hasRun = true;

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
            ] || null
          : null;

      this.tvWasOn =
        Boolean(
          this.tvComponent &&
          this.tvComponent.isOn
        );

      if (
        this.tvWasOn &&
        this.tvComponent &&
        this.tvComponent.setState
      ) {
        this.tvComponent.setState(
          false
        );
      }

      this.lightsOff();
      await ritualWait(90);

      this.lightsOn();
      await ritualWait(210);

      this.lightsOff();
      await ritualWait(70);

      this.lightsOn();
      await ritualWait(135);

      this.lightsOff();
      await ritualWait(130);

      this.lightsOn();
      await ritualWait(180);

      this.lightsOff();

      this.el.sceneEl.emit(
        'offering-blackout-started',
        {},
        false
      );

      await ritualWait(
        this.data.blackoutDuration
      );

      this.lightsOn();

      if (
        this.tvWasOn &&
        this.tvComponent &&
        this.tvComponent.setState
      ) {
        this.tvComponent.setState(
          true
        );
      }

      this.el.sceneEl.emit(
        'offering-blackout-finished',
        {},
        false
      );
    },

  remove: function () {
    this.el.sceneEl.removeEventListener(
      'offering-completed',
      this.onOfferingCompleted
    );
  }
});


/* ============================================================
   TEMPORARY BAN THO CLICK / TRIGGER SMOKE
============================================================ */

AFRAME.registerComponent(
  'temporary-offering-table-smoke',
  {
    schema: {
      duration: {
        default: 4200
      },

      count: {
        default: 22
      },

      height: {
        default: 0.82
      },

      speed: {
        default: 0.19
      },

      width: {
        default: 0.15
      },

      opacity: {
        default: 0.20
      },

      size: {
        default: 0.052
      },

      color: {
        default: '#d4d4d4'
      },

      offsetX: {
        default: 0
      },

      offsetY: {
        default: 0.035
      },

      offsetZ: {
        default: 0
      }
    },

    init: function () {
      this.smokeAnchor = null;
      this.remainingMs = 0;
      this.lastTriggerTime = 0;

      this.onDesktopClick =
        this.onDesktopClick.bind(
          this
        );

      this.onModelLoaded =
        this.onModelLoaded.bind(
          this
        );

      this.el.addEventListener(
        'click',
        this.onDesktopClick
      );

      this.el.addEventListener(
        'model-loaded',
        this.onModelLoaded
      );

      this.createSmokeAnchor();

      if (
        this.el.getObject3D(
          'mesh'
        )
      ) {
        this.onModelLoaded();
      }
    },

    createSmokeAnchor:
      function () {
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

        this.el.sceneEl.appendChild(
          anchor
        );

        this.smokeAnchor =
          anchor;
      },

    onModelLoaded:
      function () {
        this.updateSmokePosition();
      },

    updateSmokePosition:
      function () {
        const root =
          this.el.getObject3D(
            'mesh'
          );

        if (
          !root ||
          !this.smokeAnchor
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

        const world =
          new THREE.Vector3(
            (
              box.min.x +
              box.max.x
            ) / 2 +
            this.data.offsetX,

            box.max.y +
            this.data.offsetY,

            (
              box.min.z +
              box.max.z
            ) / 2 +
            this.data.offsetZ
          );

        this.el.sceneEl.object3D.updateMatrixWorld(
          true
        );

        this.smokeAnchor.object3D.position.copy(
          this.el.sceneEl.object3D.worldToLocal(
            world.clone()
          )
        );

        return true;
      },

    onDesktopClick:
      function (event) {
        if (
          ritualIsPaused() ||
          ritualIsImmersiveXR(
            this.el.sceneEl
          )
        ) {
          return;
        }

        const intersection =
          event &&
          event.detail
            ? event.detail.intersection
            : null;

        if (
          intersection &&
          !ritualObjectBelongsToEntity(
            intersection.object,
            this.el
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

    triggerSmoke:
      function () {
        if (
          ritualIsPaused()
        ) {
          return false;
        }

        const now =
          performance.now();

        if (
          now -
          this.lastTriggerTime <
          350
        ) {
          return false;
        }

        this.lastTriggerTime =
          now;

        if (
          !this.updateSmokePosition()
        ) {
          return false;
        }

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
          'Temporary bantho smoke triggered.'
        );

        return true;
      },

    stopSmoke:
      function () {
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

    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          ritualIsPaused() ||
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

    remove:
      function () {
        this.el.removeEventListener(
          'click',
          this.onDesktopClick
        );

        this.el.removeEventListener(
          'model-loaded',
          this.onModelLoaded
        );

        if (
          this.smokeAnchor &&
          this.smokeAnchor.parentNode
        ) {
          this.smokeAnchor.parentNode.removeChild(
            this.smokeAnchor
          );
        }
      }
  }
);


/* ============================================================
   QUEST TEMPORARY BAN THO INTERACTOR
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
      this.triggerHeld = false;

      this.pressTrigger =
        this.pressTrigger.bind(
          this
        );

      this.releaseTrigger =
        this.releaseTrigger.bind(
          this
        );

      this.onTriggerChanged =
        this.onTriggerChanged.bind(
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
          ritualIsPaused()
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

    useOfferingTable:
      function () {
        if (
          ritualIsPaused()
        ) {
          return;
        }

        const bantho =
          document.querySelector(
            '#bantho'
          );

        const raycaster =
          this.el.components
            .raycaster;

        if (
          !bantho ||
          !raycaster
        ) {
          return;
        }

        const component =
          bantho.components[
            'temporary-offering-table-smoke'
          ];

        if (!component) {
          return;
        }

        if (
          raycaster.refreshObjects
        ) {
          raycaster.refreshObjects();
        }

        const closest =
          (
            raycaster.intersections ||
            []
          )[0];

        if (!closest) {
          return;
        }

        if (
          !ritualObjectBelongsToEntity(
            closest.object,
            bantho
          )
        ) {
          return;
        }

        component.triggerSmoke();
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
   AUTO SETUP
   No index.html edit needed.
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

  const cursor =
    document.querySelector(
      'a-cursor'
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

  bantho.classList.add(
    'offering-smoke-interactable'
  );

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

  ritualAppendRaycasterSelector(
    cursor,
    '.offering-smoke-interactable'
  );

  ritualAppendRaycasterSelector(
    rightHand,
    '.offering-smoke-interactable'
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
    'Temporary bantho smoke interaction ready.'
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