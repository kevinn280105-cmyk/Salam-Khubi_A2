/* ============================================================
   incense.js
   ROOMS WITHIN - VIETNAMESE ALTAR / INCENSE OFFERING

   Ritual flow:
   1. Pick up incense.
   2. Hold the burning tip near the altar flame for ~0.7 s.
   3. Ember + smoke begin.
   4. While holding the lit incense, bow 3 times.
   5. Move the LOWER end of the incense into the bat huong zone.
   6. Incense snaps upright into place.
   7. Emits "offering-completed".
   8. A short flicker/blackout happens after the offering.

   No incense GLB is required yet. index.html uses a temporary cylinder.
   Later, replace the temporary geometry with incense.glb but KEEP:
   - #incenseStick
   - #incenseTip
   - #incenseBase
   - incense-offering component
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
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

  const normalizedKeywords = keywords.map(ritualNormalizeName);
  let result = null;

  root.traverse((node) => {
    if (result) return;

    const names = [node.name || ''];

    if (node.material) {
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];

      materials.forEach((material) => {
        if (material && material.name) names.push(material.name);
      });
    }

    const combined = ritualNormalizeName(names.join(' '));

    if (
      normalizedKeywords.some((keyword) =>
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

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;

  return box.getCenter(new THREE.Vector3());
}

function ritualWorldBox(object) {
  if (!object) return null;
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  return box.isEmpty() ? null : box;
}


/* ============================================================
   INCENSE SMOKE

   Improved smoke system:
   - Soft generated smoke texture (no image file required).
   - Bottom section rises almost straight like laminar smoke.
   - Middle section slowly curls into S-shapes.
   - Top section spreads, drifts and fades irregularly.
   - Smoke lives in WORLD SPACE, so it always rises upward even
     while the player tilts or carries the incense.
   - Works on Mac and Quest.
   - Pauses when the Rooms Within pause menu opens.
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
    this.isRoomsPaused = false;

    this.smokeTexture = this.createSmokeTexture();

    this.onRoomsPauseChanged = (event) => {
      this.isRoomsPaused = Boolean(
        event &&
        event.detail &&
        event.detail.paused
      );
    };

    this.el.sceneEl.addEventListener(
      'rooms-pause-changed',
      this.onRoomsPauseChanged
    );

    this.createPuffs();
  },

  createSmokeTexture: function () {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;

    const context = canvas.getContext('2d');

    const gradient = context.createRadialGradient(
      64, 64, 2,
      64, 64, 61
    );

    gradient.addColorStop(
      0,
      'rgba(235,235,235,0.78)'
    );

    gradient.addColorStop(
      0.18,
      'rgba(220,220,220,0.58)'
    );

    gradient.addColorStop(
      0.42,
      'rgba(200,200,200,0.30)'
    );

    gradient.addColorStop(
      0.72,
      'rgba(175,175,175,0.10)'
    );

    gradient.addColorStop(
      1,
      'rgba(160,160,160,0)'
    );

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
  },

  createPuffs: function () {
    for (let i = 0; i < this.data.count; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.smokeTexture,
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

  update: function (oldData) {
    if (!this.data.active) {
      this.hideAllPuffs();
    }

    if (
      oldData &&
      oldData.color &&
      oldData.color !== this.data.color
    ) {
      const color = new THREE.Color(this.data.color);

      this.puffs.forEach((puff) => {
        puff.material.color.copy(color);
      });
    }
  },

  hideAllPuffs: function () {
    this.puffs.forEach((puff) => {
      puff.sprite.visible = false;
      puff.material.opacity = 0;
    });
  },

  resetPuff: function (puff) {
    puff.life = 0;
    puff.phase = Math.random() * Math.PI * 2;
    puff.driftX = (Math.random() - 0.5) * 2;
    puff.driftZ = (Math.random() - 0.5) * 2;
    puff.sizeSeed = 0.72 + Math.random() * 0.58;
    puff.rotationSpeed = (Math.random() - 0.5) * 0.34;
    puff.opacitySeed = 0.82 + Math.random() * 0.25;
  },

  tick: function (time, deltaTime) {
    if (
      !this.data.active ||
      !deltaTime ||
      this.isRoomsPaused
    ) {
      return;
    }

    this.el.object3D.getWorldPosition(this.tipWorld);

    const dt = Math.min(deltaTime / 1000, 0.05);
    const t = time * 0.001;

    this.puffs.forEach((puff) => {
      /*
        A slower life rate keeps incense smoke gentle rather than
        looking like fire or steam.
      */
      puff.life += dt * this.data.speed * 1.35;

      if (puff.life > 1) {
        this.resetPuff(puff);
      }

      if (puff.life < 0) {
        puff.sprite.visible = false;
        return;
      }

      const life = puff.life;
      const y = life * this.data.height;

      /* ------------------------------------------------------
         THREE SMOKE REGIONS

         0.00 - 0.28 : thin and almost vertical
         0.28 - 0.68 : slow S-shaped curling
         0.68 - 1.00 : spreading and irregular turbulence
      ------------------------------------------------------ */

      const lowerAmount = THREE.MathUtils.clamp(
        life / 0.28,
        0,
        1
      );

      const middleAmount = THREE.MathUtils.smoothstep(
        life,
        0.20,
        0.72
      );

      const upperAmount = THREE.MathUtils.smoothstep(
        life,
        0.58,
        1
      );

      /* Very thin lower thread. */
      const lowerX =
        Math.sin(t * 0.65 + puff.phase) *
        this.data.width *
        0.035 *
        lowerAmount;

      const lowerZ =
        Math.cos(t * 0.55 + puff.phase * 1.2) *
        this.data.width *
        0.025 *
        lowerAmount;

      /* Slow S-shaped middle curl. */
      const curlX =
        Math.sin(
          t * 0.95 +
          life * 8.6 +
          puff.phase
        ) *
        this.data.width *
        0.52 *
        middleAmount;

      const curlZ =
        Math.cos(
          t * 0.78 +
          life * 7.1 +
          puff.phase * 1.35
        ) *
        this.data.width *
        0.36 *
        middleAmount;

      /* Wider, less predictable top section. */
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
          t * 1.55 +
          life * 14.5 +
          puff.phase * 1.8
        ) *
        this.data.width *
        0.18 *
        upperAmount;

      const turbulenceZ =
        Math.cos(
          t * 1.35 +
          life * 12.4 +
          puff.phase * 1.15
        ) *
        this.data.width *
        0.15 *
        upperAmount;

      puff.sprite.position.set(
        this.tipWorld.x +
          lowerX +
          curlX +
          driftX +
          turbulenceX,

        this.tipWorld.y + y,

        this.tipWorld.z +
          lowerZ +
          curlZ +
          driftZ +
          turbulenceZ
      );

      /*
        Smoke begins as a narrow thread and becomes wider/softer
        as it climbs.
      */
      const baseScale =
        this.data.size *
        puff.sizeSeed;

      const expansion =
        0.56 +
        life * 2.65;

      const width =
        baseScale * expansion;

      puff.sprite.scale.set(
        width,
        width * (1.28 + upperAmount * 0.24),
        1
      );

      puff.material.rotation =
        puff.phase +
        t * puff.rotationSpeed;

      /* ------------------------------------------------------
         OPACITY

         - starts almost invisible at the ember
         - strongest around the lower-middle column
         - dissolves gradually at the top
      ------------------------------------------------------ */

      const fadeIn = THREE.MathUtils.smoothstep(
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

      const irregularity =
        puff.opacitySeed *
        (
          0.90 +
          Math.sin(
            t * 0.9 +
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
        puff.material.opacity > 0.002;
    });
  },

  remove: function () {
    this.el.sceneEl.removeEventListener(
      'rooms-pause-changed',
      this.onRoomsPauseChanged
    );

    this.puffs.forEach((puff) => {
      this.sceneObject.remove(puff.sprite);
      puff.material.dispose();
    });

    if (this.smokeTexture) {
      this.smokeTexture.dispose();
    }

    this.puffs = [];
  }
});


/* ============================================================
   OFFERING LAYOUT

   Tries to find Blender objects named like:
   - bat huong / incense bowl / censer
   - candle / nen / lamp / den

   If those names do not exist, it estimates positions from the
   bantho.glb bounding box so the temporary interaction objects
   remain near the altar instead of appearing elsewhere in room.
============================================================ */

AFRAME.registerComponent('offering-layout', {
  schema: {
    altar: { type: 'selector' },
    surfaceRatio: { default: 0.62 },
    pickupSide: { default: -0.28 },
    flameSide: { default: 0.28 },
    frontOffset: { default: 0.0 },
    temporaryFlame: { default: true },
    debugVisible: { default: false }
  },

  init: function () {
    this.applyLayout = this.applyLayout.bind(this);

    const altar = this.data.altar;
    if (!altar) {
      console.warn('Offering layout: #bantho was not found.');
      return;
    }

    altar.addEventListener('model-loaded', this.applyLayout);

    if (altar.getObject3D('mesh')) this.applyLayout();
  },

  setEntityWorldPosition: function (entity, worldPosition) {
    if (!entity || !worldPosition) return;

    const parent = entity.object3D.parent;
    if (!parent) {
      entity.object3D.position.copy(worldPosition);
      return;
    }

    parent.updateMatrixWorld(true);
    const local = parent.worldToLocal(worldPosition.clone());
    entity.object3D.position.copy(local);
  },

  applyLayout: function () {
    const altar = this.data.altar;
    const root = altar ? altar.getObject3D('mesh') : null;
    if (!root) return;

    root.updateMatrixWorld(true);

    const altarBox = ritualWorldBox(root);
    if (!altarBox) return;

    const size = altarBox.getSize(new THREE.Vector3());
    const center = altarBox.getCenter(new THREE.Vector3());

    const bowlObject = ritualFindNamedObject(root, [
      'bat huong',
      'bathuong',
      'incense bowl',
      'incense burner',
      'censer',
      'urn'
    ]);

    const flameObject = ritualFindNamedObject(root, [
      'candle',
      'nen',
      'lamp',
      'den dau',
      'oil lamp',
      'flame',
      'lua'
    ]);

    const surfaceY =
      altarBox.min.y + size.y * this.data.surfaceRatio;

    let bowlPosition;

    if (bowlObject) {
      const bowlBox = ritualWorldBox(bowlObject);

      bowlPosition = bowlBox
        ? new THREE.Vector3(
            (bowlBox.min.x + bowlBox.max.x) * 0.5,
            bowlBox.max.y + 0.015,
            (bowlBox.min.z + bowlBox.max.z) * 0.5
          )
        : ritualWorldCenter(bowlObject);

      console.log(
        'Offering layout: bat huong object found:',
        bowlObject.name
      );
    } else {
      bowlPosition = new THREE.Vector3(
        center.x,
        surfaceY + 0.035,
        center.z + this.data.frontOffset
      );

      console.log(
        'Offering layout: no named bat huong found; using altar estimate.'
      );
    }

    let flamePosition;

    if (flameObject) {
      const flameBox = ritualWorldBox(flameObject);

      flamePosition = flameBox
        ? new THREE.Vector3(
            (flameBox.min.x + flameBox.max.x) * 0.5,
            flameBox.max.y + 0.025,
            (flameBox.min.z + flameBox.max.z) * 0.5
          )
        : ritualWorldCenter(flameObject);

      console.log(
        'Offering layout: flame/lamp object found:',
        flameObject.name
      );
    } else {
      flamePosition = new THREE.Vector3(
        center.x + size.x * this.data.flameSide,
        surfaceY + 0.12,
        center.z + this.data.frontOffset
      );

      console.log(
        'Offering layout: no named candle/lamp found; using temporary flame.'
      );
    }

    const pickupPosition = new THREE.Vector3(
      center.x + size.x * this.data.pickupSide,
      surfaceY + 0.055,
      center.z + this.data.frontOffset
    );

    const bowlZone =
      document.querySelector('#incenseBowlZone');

    const placedPoint =
      document.querySelector('#incensePlacedPoint');

    const flameZone =
      document.querySelector('#incenseFlameZone');

    const flameVisual =
      document.querySelector('#incenseFlameVisual');

    const incense =
      document.querySelector('#incenseStick');

    this.setEntityWorldPosition(
      bowlZone,
      bowlPosition
    );

    /*
      Stick is 0.38m tall.
      Its CENTER sits 0.19m above the insertion point.
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

    this.setEntityWorldPosition(
      flameZone,
      flamePosition
    );

    this.setEntityWorldPosition(
      flameVisual,
      flamePosition
    );

    this.setEntityWorldPosition(
      incense,
      pickupPosition
    );

    if (
      incense &&
      !incense.is('grabbed')
    ) {
      incense.object3D.rotation.set(
        0,
        0,
        THREE.MathUtils.degToRad(90)
      );
    }

    if (flameVisual) {
      flameVisual.setAttribute(
        'visible',
        Boolean(
          this.data.temporaryFlame &&
          !flameObject
        )
      );
    }

    const debugVisible =
      Boolean(this.data.debugVisible);

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
    if (this.data.altar) {
      this.data.altar.removeEventListener(
        'model-loaded',
        this.applyLayout
      );
    }
  }
});


/* ============================================================
   INCENSE OFFERING INTERACTION
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
    this.warnedPlacementEarly = false;

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

    if (
      this.data.tip &&
      this.data.tip.components['incense-smoke']
    ) {
      this.data.tip.setAttribute(
        'incense-smoke',
        'active',
        false
      );
    }

    console.log(
      'Incense ritual ready: pick up → light → bow 3x → place in bat huong.'
    );
  },

  isHeld: function () {
    return (
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
    /*
      Desktop test shortcut:
      B = one completed bow.
    */

    if (
      String(event.key || '')
        .toLowerCase() === 'b' &&
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

  getHeadDownAngle: function () {
    const cameraEl =
      document.querySelector('#cam');

    if (!cameraEl) {
      return 0;
    }

    cameraEl.object3D
      .getWorldQuaternion(
        this.headQuat
      );

    this.forward
      .set(0, 0, -1)
      .applyQuaternion(
        this.headQuat
      )
      .normalize();

    /*
      Looking down produces a positive number here.
    */
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
    const now =
      performance.now();

    if (
      now - this.lastBowTime <
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
    this.bowCount += 1;

    console.log(
      `Offering bow ${this.bowCount}/${this.data.requiredBows}`
    );

    this.el.emit(
      'offering-bow',
      {
        count: this.bowCount,
        total: this.data.requiredBows
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

  updateBowDetection: function () {
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
      Phase 1:
      head goes down.
    */
    if (
      !this.bowWasDown &&
      downAngle >=
        this.data.bowDownAngle
    ) {
      this.bowWasDown = true;
      return;
    }

    /*
      Phase 2:
      head returns upright.
      Only now does it count.
    */
    if (
      this.bowWasDown &&
      downAngle <=
        this.data.bowUpAngle
    ) {
      this.bowWasDown = false;
      this.registerBow();
    }
  },

  lightIncense: function () {
    if (
      this.state !== 'unlit'
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

      window.setTimeout(
        () => {
          if (this.data.tipFlame) {
            this.data.tipFlame.setAttribute(
              'visible',
              false
            );
          }
        },
        450
      );
    }

    /*
      Turn on the improved smoke system.
    */
    if (this.data.tip) {
      this.data.tip.setAttribute(
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

  updateLighting: function (
    deltaTime
  ) {
    if (
      this.state !== 'unlit' ||
      !this.isHeld() ||
      !this.data.tip ||
      !this.data.flameZone
    ) {
      this.lightProgress = 0;
      return;
    }

    this.data.tip.object3D
      .getWorldPosition(
        this.tipWorld
      );

    this.data.flameZone.object3D
      .getWorldPosition(
        this.flameWorld
      );

    const distance =
      this.tipWorld.distanceTo(
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
      this.lightProgress = 0;
    }
  },

  updatePlacement: function () {
    if (
      !this.isLit() ||
      this.completed ||
      !this.isHeld() ||
      !this.data.base ||
      !this.data.bowlZone
    ) {
      return;
    }

    this.data.base.object3D
      .getWorldPosition(
        this.baseWorld
      );

    this.data.bowlZone.object3D
      .getWorldPosition(
        this.bowlWorld
      );

    const distance =
      this.baseWorld.distanceTo(
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

  detachFromCurrentHolder: function () {
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

    /*
      Move back to scene root while preserving
      current world transform.
    */
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
      Scene root is the parent after detach,
      so world = local here.
    */
    this.el.object3D.position.copy(
      worldPosition
    );

    this.el.object3D.quaternion.copy(
      worldQuaternion
    );

    this.state = 'placed';
    this.completed = true;

    /*
      It can no longer be picked back up after
      the ritual is complete.
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
      bows: this.bowCount,
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

  remove: function () {
    window.removeEventListener(
      'keydown',
      this.onKeyDown
    );
  }
});


/* ============================================================
   OFFERING BLACKOUT

   A little after offering-completed:
   flicker → flicker → blackout → lights return.

   Incense ember/smoke stay visible because they are materials,
   not A-Frame light components.
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
      this.hasRun = false;

      this.lightStates = [];

      this.tvWasOn = false;

      this.tvComponent = null;

      this.onOfferingCompleted =
        this.onOfferingCompleted.bind(this);

      this.el.sceneEl.addEventListener(
        'offering-completed',
        this.onOfferingCompleted
      );
    },

    captureLights: function () {
      this.lightStates = [];

      this.el.sceneEl
        .querySelectorAll('[light]')
        .forEach((entity) => {
          this.lightStates.push({
            entity: entity,

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
        });
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

        /*
          If the real CRT TV is currently on,
          turn it off during blackout and remember
          its previous state.
        */

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
          this.tvComponent.setState
        ) {
          this.tvComponent.setState(
            false
          );
        }

        /* ==================================================
           UNEVEN HORROR FLICKERING
        =================================================== */

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


        /* ==================================================
           FULL BLACKOUT
        =================================================== */

        this.lightsOff();

        this.el.sceneEl.emit(
          'offering-blackout-started',
          {},
          false
        );

        await ritualWait(
          this.data.blackoutDuration
        );


        /* ==================================================
           LIGHTS SNAP BACK
        =================================================== */

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


        console.log(
          'Offering blackout finished.'
        );
      },

    remove: function () {
      this.el.sceneEl.removeEventListener(
        'offering-completed',
        this.onOfferingCompleted
      );
    }

  }
);