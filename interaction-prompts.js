/* interaction-prompts.js — ROOMS WITHIN
   Full replacement.

   UNIVERSAL WORLD INTERACTION PROMPT:
   - interaction-prompts.js is the ONLY visible world interaction prompt system.
   - In Quest, point the RIGHT controller laser at an interactable object.
   - On Mac, point the centre crosshair at an interactable object.
   - One camera-attached action prompt appears near the reticle.
   - Point away and the action prompt disappears.

   Current action prompts:
   - Teddy = INSPECT TEDDY BEAR.
   - Hair Clipper = INSPECT HAIR CLIPPER.
   - Picture = INSPECT PICTURE.
   - TV = TURN ON TV / TURN OFF TV.
   - Altar = LIGHT THE INCENSE.

   Quest-item description behavior:
   - DO NOT click or press Trigger to open a description.
   - Keep pointing at Teddy / Hair Clipper / Picture for about 1.5 seconds.
   - The central INSPECT prompt then hides and a small description card appears
     BESIDE the real object in the room.
   - Look / point away and the description disappears.
   - No game pause.
   - No blackout.
   - No inspection screen.
   - No Exit / X button.
   - Quest Grip/Squeeze still physically picks up the object.
   - Mac click still physically picks up / drops the object.
   - The checklist is NOT completed by hovering. story.js still checks an
     item only after it has been physically grabbed and placed on #truocbantho.
*/

const ROOMS_QUEST_ITEMS = [
  {
    key: 'teddy',
    title: 'TEDDY BEAR',
    description:
      'An old teddy bear. Its fur is worn from years of being held. ' +
      'Something about it feels strangely familiar.',
    selectors: ['#teddy', '[data-quest-item="teddy"]']
  },
  {
    key: 'hair-clipper',
    title: 'HAIR CLIPPER',
    description:
      'An old hair clipper. The metal is cold and the casing is ' +
      'scratched from repeated use.',
    selectors: [
      '#hairClipper',
      '#hair-clipper',
      '#clipper',
      '#hairpin',
      '[data-quest-item="hair-clipper"]'
    ]
  },
  {
    key: 'picture',
    title: 'PICTURE',
    description:
      'An old picture. Time has faded the image, but the people in ' +
      'it still seem important.',
    selectors: [
      '#picture',
      '#photo',
      '#pictureFrame',
      '#picture-frame',
      '[data-quest-item="picture"]'
    ]
  }
];

const ROOMS_DESCRIPTION_UI = {
  questPosition: '0.77 0.39 -0.85',
  actionPromptPosition: '0 -0.18 -0.80',

  /*
    Continuous pointing time before the quest-item description appears.
    1500 ms = 1.5 seconds.
  */
  hoverDelay: 1500,

  /*
    World-space offset from the physical item.
    The code chooses the left/right side automatically so the card tends
    to appear toward the centre of the player's view.
  */
  hoverSideOffset: 0.34,
  hoverVerticalOffset: 0.08,

  showQuestTrackerOnDesktop: true
};

const roomsPromptState = {
  system: null,

  /*
    Hover-description state.
  */
  hoverEntity: null,
  hoverItem: null,
  hoverStartedAt: 0,
  hoverVisible: false,

  /*
    Kept only for compatibility with older debug/story code.
    The new hover description never opens an inspection mode,
    never pauses the game, and never locks input.
  */
  inspectionOpen: false,
  inspectedEntity: null,
  inspectedItem: null,
  inspectedItems: new Set(),

  /*
    foundItems is the CHECKLIST state only.
    story.js sets these when the real physical objects are
    placed on #truocbantho.
  */
  foundItems: new Set(),

  /*
    incenseLit tracks the ritual objective shown at the
    top of the quest HUD (set by onIncenseLit() when
    incense.js emits "incense-lit" on #incenseStick).
  */
  incenseLit: false,

  pausedByInspection: false
};

window.roomsInspectionOpen = false;


/* ============================================================
   HELPERS
============================================================ */

function roomsPromptsImmersiveXR(scene) {
  try {
    return Boolean(
      scene &&
      scene.renderer &&
      scene.renderer.xr &&
      (
        scene.renderer.xr.isPresenting ||
        (
          scene.renderer.xr.getSession &&
          scene.renderer.xr.getSession()
        )
      )
    );
  } catch (error) {
    return false;
  }
}

function roomsSetVisible(el, visible) {
  if (el) el.setAttribute('visible', Boolean(visible));
}

function roomsMatches(el, selector) {
  if (!el || !selector || !el.matches) return false;

  try {
    return el.matches(selector);

  } catch (error) {
    return false;
  }
}

function roomsCreateEntity(tag, attrs = {}) {
  const el =
    document.createElement(tag);

  Object.entries(attrs)
    .forEach(
      ([name, value]) => {
        el.setAttribute(
          name,
          value
        );
      }
    );

  return el;
}

function roomsCreateText(
  value,
  position,
  width,
  align = 'left',
  color = '#ffffff',
  wrapCount = 32
) {
  return roomsCreateEntity(
    'a-text',
    {
      value:
        value || '',

      position,

      width,

      align,

      color,

      'wrap-count':
        String(
          wrapCount
        ),

      side:
        'double',

      material:
        'shader: flat; depthTest: false; depthWrite: false'
    }
  );
}


/* ============================================================
   ROUNDED PANEL / SOFT SHADOW TEXTURES

   A-Frame planes are sharp rectangles by default. These build
   small Canvas2D textures (rounded rect fill + border, and a
   blurred rounded rect for a drop shadow) so the quest HUD can
   look like a proper rounded card instead of a flat box.
============================================================ */

function roomsHexToRgbParts(hex) {
  const value = String(hex || '#000000').replace('#', '');
  const bigint = parseInt(value, 16);

  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function roomsRgba(hex, opacity) {
  const parts = roomsHexToRgbParts(hex);
  return `rgba(${parts.r}, ${parts.g}, ${parts.b}, ${opacity})`;
}

function roomsDrawRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roomsCreateRoundedPanelTexture(options) {
  const width = options.width;
  const height = options.height;
  const margin = Math.max(6, Math.ceil((options.strokeWidth || 0) / 2) + 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');

  roomsDrawRoundedRectPath(
    ctx,
    margin,
    margin,
    width - margin * 2,
    height - margin * 2,
    options.radius
  );

  ctx.fillStyle = roomsRgba(options.fillColor, options.fillOpacity);
  ctx.fill();

  if (options.strokeWidth > 0) {
    ctx.lineWidth = options.strokeWidth;
    ctx.strokeStyle = roomsRgba(options.strokeColor, options.strokeOpacity);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return texture;
}

function roomsCreatePanelShadowTexture(options) {
  const blur = options.blur;
  const pad = blur * 2;

  const canvas = document.createElement('canvas');
  canvas.width = options.width + pad * 2;
  canvas.height = options.height + pad * 2;

  const ctx = canvas.getContext('2d');

  ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = roomsRgba('#000000', options.opacity);

  roomsDrawRoundedRectPath(
    ctx,
    pad,
    pad,
    options.width,
    options.height,
    options.radius
  );

  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return texture;
}

function roomsApplyCanvasTexture(entity, texture) {
  const mesh = entity.getObject3D('mesh');

  if (!mesh || !mesh.material) {
    /*
      Mesh not ready yet (should be rare -- entities only get
      here after being connected to a loaded scene, and plane
      primitives initialize synchronously). Fall back to the
      entity's own "loaded" lifecycle event just in case.
    */
    entity.addEventListener(
      'loaded',
      () => roomsApplyCanvasTexture(entity, texture),
      { once: true }
    );

    return;
  }

  mesh.material.map = texture;
  mesh.material.color.set('#ffffff');
  mesh.material.transparent = true;
  mesh.material.needsUpdate = true;
}
/* ============================================================
   QUEST ITEM INVISIBLE AIM HITBOXES
============================================================ */

function roomsGetEntityLocalModelBox(
  entity
) {
  if (!entity) {
    return null;
  }

  const root =
    entity.getObject3D(
      'mesh'
    );

  if (!root) {
    return null;
  }

  entity.object3D
    .updateMatrixWorld(
      true
    );

  root.updateMatrixWorld(
    true
  );

  const inverseEntityWorld =
    new THREE.Matrix4()
      .copy(
        entity.object3D
          .matrixWorld
      )
      .invert();

  const box =
    new THREE.Box3();

  box.makeEmpty();

  root.traverse(
    (node) => {
      if (
        !node.isMesh ||
        !node.geometry
      ) {
        return;
      }

      if (
        !node.geometry
          .boundingBox
      ) {
        node.geometry
          .computeBoundingBox();
      }

      if (
        !node.geometry
          .boundingBox
      ) {
        return;
      }

      const toEntityLocal =
        new THREE.Matrix4()
          .multiplyMatrices(
            inverseEntityWorld,
            node.matrixWorld
          );

      box.union(
        node.geometry
          .boundingBox
          .clone()
          .applyMatrix4(
            toEntityLocal
          )
      );
    }
  );

  return box.isEmpty()
    ? null
    : box;
}


function roomsQuestHitboxSettings(
  item
) {
  if (!item) {
    return {
      scale: 1.55,
      minX: 0.22,
      minY: 0.22,
      minZ: 0.18
    };
  }

  if (
    item.key ===
    'teddy'
  ) {
    return {
      scale: 1.70,
      minX: 0.30,
      minY: 0.34,
      minZ: 0.26
    };
  }

  if (
    item.key ===
    'hair-clipper'
  ) {
    return {
      scale: 1.75,
      minX: 0.24,
      minY: 0.24,
      minZ: 0.20
    };
  }

  if (
    item.key ===
    'picture'
  ) {
    return {
      scale: 1.45,
      minX: 0.28,
      minY: 0.28,
      minZ: 0.16
    };
  }

  return {
    scale: 1.55,
    minX: 0.22,
    minY: 0.22,
    minZ: 0.18
  };
}


function roomsCreateOrUpdateQuestHitbox(
  entity
) {
  const item =
    roomsGetQuestItemForEntity(
      entity
    );

  if (
    !entity ||
    !item
  ) {
    return null;
  }

  let hitbox =
    null;

  for (
    const child of
    entity.children || []
  ) {
    if (
      child.classList &&
      child.classList
        .contains(
          'quest-hover-hitbox'
        )
    ) {
      hitbox =
        child;

      break;
    }
  }

  if (!hitbox) {
    hitbox =
      roomsCreateEntity(
        'a-box',
        {
          class:
            'quest-hover-hitbox',

          visible:
            'true',

          material:
            'opacity: 0; transparent: true; ' +
            'depthWrite: false; side: double'
        }
      );

    hitbox.setAttribute(
      'data-quest-hitbox-for',
      item.key
    );

    /*
      This helper box is only for easier hover targeting.

      On Mac, a click may land on this invisible child instead of the
      real GLB entity. Forward that click to natural-grabbable so physical
      pickup/drop still works. It NEVER opens a description.
    */
    hitbox.addEventListener(
      'click',
      (event) => {
        if (
          roomsPromptsImmersiveXR(
            entity.sceneEl
          ) ||
          window.roomsPaused ||
          window.roomsInputLocked
        ) {
          return;
        }

        if (
          event &&
          event.stopPropagation
        ) {
          event.stopPropagation();
        }

        const grabbable =
          entity.components &&
          entity.components[
            'natural-grabbable'
          ];

        if (
          grabbable &&
          typeof grabbable
            .onDesktopClick ===
            'function'
        ) {
          grabbable
            .onDesktopClick();
        }
      }
    );

    entity.appendChild(
      hitbox
    );
  }

  const box =
    roomsGetEntityLocalModelBox(
      entity
    );

  if (!box) {
    return hitbox;
  }

  const center =
    box.getCenter(
      new THREE.Vector3()
    );

  const size =
    box.getSize(
      new THREE.Vector3()
    );

  const settings =
    roomsQuestHitboxSettings(
      item
    );

  hitbox.object3D
    .position
    .copy(
      center
    );

  hitbox.setAttribute(
    'width',
    Math.max(
      size.x *
        settings.scale,
      settings.minX
    )
  );

  hitbox.setAttribute(
    'height',
    Math.max(
      size.y *
        settings.scale,
      settings.minY
    )
  );

  hitbox.setAttribute(
    'depth',
    Math.max(
      size.z *
        settings.scale,
      settings.minZ
    )
  );

  return hitbox;
}


/* ============================================================
   QUEST ITEM LOOKUP
============================================================ */

function roomsGetQuestItemForEntity(
  el
) {
  if (!el) {
    return null;
  }

  for (
    const item of
    ROOMS_QUEST_ITEMS
  ) {
    if (
      item.selectors
        .some(
          (selector) =>
            roomsMatches(
              el,
              selector
            )
        )
    ) {
      return item;
    }
  }

  return null;
}


function roomsFindQuestAncestor(
  el
) {
  let current =
    el;

  while (
    current &&
    current.tagName &&
    current.tagName
      .toLowerCase() !==
      'a-scene'
  ) {
    if (
      roomsGetQuestItemForEntity(
        current
      )
    ) {
      return current;
    }

    current =
      current.parentElement;
  }

  return null;
}


/* ============================================================
   RAYCAST HELPERS
============================================================ */

function roomsIntersectionQuestTarget(
  intersection
) {
  if (!intersection) {
    return null;
  }

  if (
    intersection.el &&
    intersection.el.nodeType ===
      1
  ) {
    const quest =
      roomsFindQuestAncestor(
        intersection.el
      );

    if (quest) {
      return quest;
    }
  }

  let object =
    intersection.object;

  while (object) {
    if (
      object.el &&
      object.el.nodeType ===
        1
    ) {
      const quest =
        roomsFindQuestAncestor(
          object.el
        );

      if (quest) {
        return quest;
      }
    }

    object =
      object.parent;
  }

  return null;
}


function roomsGetRayTarget(
  rayEntity
) {
  if (
    !rayEntity ||
    !rayEntity.components ||
    !rayEntity.components
      .raycaster
  ) {
    return null;
  }

  const raycaster =
    rayEntity.components
      .raycaster;

  if (
    raycaster.refreshObjects
  ) {
    raycaster
      .refreshObjects();
  }

  for (
    const hit of
    raycaster.intersections || []
  ) {
    const target =
      roomsIntersectionQuestTarget(
        hit
      );

    if (target) {
      return target;
    }
  }

  for (
    const el of
    raycaster.intersectedEls || []
  ) {
    const quest =
      roomsFindQuestAncestor(
        el
      );

    if (quest) {
      return quest;
    }
  }

  return null;
}


function roomsAppendRaySelector(
  rayEntity,
  selector
) {
  if (
    !rayEntity ||
    !selector
  ) {
    return;
  }

  const data =
    rayEntity.getAttribute(
      'raycaster'
    ) || {};

  const selectors =
    String(
      data.objects || ''
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

  rayEntity.setAttribute(
    'raycaster',
    'objects',
    selectors.join(
      ', '
    )
  );

  const component =
    rayEntity.components &&
    rayEntity.components
      .raycaster;

  if (
    component &&
    component.refreshObjects
  ) {
    component
      .refreshObjects();
  }
}


/* ============================================================
   UNIVERSAL ACTION-PROMPT TARGETS
============================================================ */

function roomsActionTypeForElement(
  el
) {
  let current =
    el;

  while (
    current &&
    current.tagName &&
    current.tagName
      .toLowerCase() !==
      'a-scene'
  ) {
    if (
      current.id ===
        'tv' ||
      (
        current.classList &&
        current.classList
          .contains(
            'tv-interactable'
          )
      )
    ) {
      return 'tv';
    }

    if (
      current.id ===
        'temporaryBanthoHitbox' ||
      current.id ===
        'bantho' ||
      (
        current.classList &&
        (
          current.classList
            .contains(
              'offering-smoke-hitbox'
            ) ||
          current.classList
            .contains(
              'offering-smoke-interactable'
            )
        )
      )
    ) {
      return 'incense';
    }

    current =
      current.parentElement;
  }

  return null;
}


function roomsActionTypeFromIntersection(
  intersection
) {
  if (!intersection) {
    return null;
  }

  if (
    intersection.el &&
    intersection.el.nodeType ===
      1
  ) {
    const type =
      roomsActionTypeForElement(
        intersection.el
      );

    if (type) {
      return type;
    }
  }

  let object =
    intersection.object;

  while (object) {
    if (
      object.el &&
      object.el.nodeType ===
        1
    ) {
      const type =
        roomsActionTypeForElement(
          object.el
        );

      if (type) {
        return type;
      }
    }

    object =
      object.parent;
  }

  return null;
}


function roomsGetActionTarget(
  rayEntity
) {
  if (
    !rayEntity ||
    !rayEntity.components ||
    !rayEntity.components
      .raycaster
  ) {
    return null;
  }

  const raycaster =
    rayEntity.components
      .raycaster;

  if (
    raycaster.refreshObjects
  ) {
    raycaster
      .refreshObjects();
  }

  const intersections =
    raycaster.intersections ||
    [];

  if (
    !intersections.length
  ) {
    return null;
  }

  for (
    const intersection of
    intersections
  ) {
    const questEntity =
      roomsIntersectionQuestTarget(
        intersection
      );

    const questItem =
      roomsGetQuestItemForEntity(
        questEntity
      );

    if (
      questEntity &&
      questItem
    ) {
      return {
        type:
          'quest-item',

        entity:
          questEntity,

        item:
          questItem,

        intersection
      };
    }

    const type =
      roomsActionTypeFromIntersection(
        intersection
      );

    if (type) {
      return {
        type,
        intersection
      };
    }
  }

  return null;
}


function roomsGetTVComponent() {
  const tv =
    document.querySelector(
      '#tv'
    );

  if (
    tv &&
    tv.components &&
    tv.components[
      'embedded-tv'
    ]
  ) {
    return tv.components[
      'embedded-tv'
    ];
  }

  const living =
    document.querySelector(
      '#living'
    );

  if (
    living &&
    living.components &&
    living.components[
      'embedded-tv'
    ]
  ) {
    return living.components[
      'embedded-tv'
    ];
  }

  return null;
}


function roomsGetIncenseComponent() {
  const altar =
    document.querySelector(
      '#bantho'
    );

  if (
    !altar ||
    !altar.components
  ) {
    return null;
  }

  return (
    altar.components[
      'temporary-offering-table-smoke'
    ] ||
    null
  );
}


function roomsGetActionPromptText(
  target
) {
  if (!target) {
    return '';
  }

  /*
    Quest items use the SAME central interaction prompt as TV / incense.

    While first aiming:
      INSPECT TEDDY BEAR
      INSPECT HAIR CLIPPER
      INSPECT PICTURE

    After the 1.5 second dwell description opens for this SAME item,
    hide the central INSPECT prompt so the player sees one clean
    description card instead of two overlapping pieces of interaction text.
  */
  if (
    target.type ===
      'quest-item' &&
    target.item
  ) {
    const descriptionOpenForThisItem =
      Boolean(
        roomsPromptState
          .hoverVisible &&
        roomsPromptState
          .hoverItem &&
        roomsPromptState
          .hoverItem
          .key ===
          target.item.key
      );

    if (
      descriptionOpenForThisItem
    ) {
      return '';
    }

    return (
      `INSPECT ${target.item.title}`
    );
  }

  if (
    target.type ===
    'tv'
  ) {
    const tv =
      roomsGetTVComponent();

    return (
      tv &&
      tv.isOn
    )
      ? 'TURN OFF TV'
      : 'TURN ON TV';
  }

  if (
    target.type ===
    'incense'
  ) {
    const incense =
      roomsGetIncenseComponent();

    if (!incense) {
      return '';
    }

    if (
      incense.hasBeenLit ||
      incense.hasBurnedOut
    ) {
      return '';
    }

    return 'LIGHT THE INCENSE';
  }

  return '';
}


function roomsHideLegacyIncenseTooltip() {
  const oldTooltip =
    document.querySelector(
      '#incenseInteractionTooltip'
    );

  if (oldTooltip) {
    oldTooltip.setAttribute(
      'visible',
      false
    );
  }
}


/* ============================================================
   MAIN COMPONENT
============================================================ */

AFRAME.registerComponent(
  'rooms-object-info-ui',
  {
    init:
      function () {
        this.scene =
          this.el.sceneEl;

        this.camera =
          null;

        this.desktopCursor =
          null;

        this.rightHand =
          null;

        this.questRoot =
          null;

        this.questRows =
          new Map();

        this.actionRoot =
          null;

        this.actionText =
          null;

        this.actionPromptLabel =
          '';

        this.actionScanElapsed =
          0;

        this.hoverRoot =
          null;

        this.hoverTitle =
          null;

        this.hoverDescription =
          null;

        this.hoverBox =
          new THREE.Box3();

        this.hoverCenter =
          new THREE.Vector3();

        this.hoverCameraWorld =
          new THREE.Vector3();

        this.hoverCameraRight =
          new THREE.Vector3();

        this.hoverCameraQuaternion =
          new THREE.Quaternion();

        this.hoverToObject =
          new THREE.Vector3();

        this.hoverWorldPosition =
          new THREE.Vector3();

        this.boundQuestEntities =
          new Set();

        this.onPauseChanged =
          this.onPauseChanged
            .bind(
              this
            );

        this.onEnterVR =
          this.onEnterVR
            .bind(
              this
            );

        this.onExitVR =
          this.onExitVR
            .bind(
              this
            );

        this.onIncenseLit =
          this.onIncenseLit
            .bind(
              this
            );

        this.prepare =
          this.prepare
            .bind(
              this
            );

        roomsPromptState
          .system =
          this;

        if (
          this.scene.hasLoaded
        ) {
          this.prepare();

        } else {
          this.scene
            .addEventListener(
              'loaded',
              this.prepare,
              {
                once:
                  true
              }
            );
        }
      },


    prepare:
      function () {
        this.camera =
          document.querySelector(
            '#cam'
          ) ||
          document.querySelector(
            '[camera]'
          );

        this.desktopCursor =
          this.camera
            ? this.camera
                .querySelector(
                  'a-cursor'
                )
            : document
                .querySelector(
                  'a-cursor'
                );

        this.rightHand =
          document.querySelector(
            '#rightHand'
          );

        if (!this.camera) {
          console.warn(
            'Rooms Within interaction UI: #cam was not found.'
          );

          return;
        }

        this.buildQuestUI();

        this.buildActionPrompt();

        this.buildHoverDescriptionUI();

        this.expandRaycasters();

        this.bindQuestItemClicks();

        this.attachListeners();

        this.updateQuestUI();

        this.syncQuestVisibility();

        [
          50,
          250,
          600,
          1200
        ].forEach(
          (delay) => {
            window.setTimeout(
              () => {
                this.expandRaycasters();

                this.bindQuestItemClicks();

                this.syncQuestVisibility();
              },

              delay
            );
          }
        );

        console.log(
          'Rooms Within universal interaction prompts and hover descriptions ready.'
        );
      },


    /* ========================================================
       RAYCASTERS
    ======================================================== */

    expandRaycasters:
      function () {
        [
          this.desktopCursor,
          this.rightHand
        ].forEach(
          (rayEntity) => {
            if (!rayEntity) {
              return;
            }

            [
              '.item',
              '.quest-item',
              '[data-quest-item]',
              '.quest-hover-hitbox',
              '#tv',
              '.tv-interactable',
              '.offering-smoke-hitbox',
              '.offering-smoke-interactable'
            ].forEach(
              (selector) => {
                roomsAppendRaySelector(
                  rayEntity,
                  selector
                );
              }
            );
          }
        );
      },


    /* ========================================================
       QUEST HOVER HITBOX SETUP
    ======================================================== */

    bindQuestItemClicks:
      function () {
        const selector = [
          '#teddy',
          '#hairClipper',
          '#hair-clipper',
          '#clipper',
          '#hairpin',
          '#picture',
          '#photo',
          '#pictureFrame',
          '#picture-frame',
          '.quest-item',
          '[data-quest-item]'
        ].join(
          ', '
        );

        document
          .querySelectorAll(
            selector
          )
          .forEach(
            (entity) => {
              if (
                this.boundQuestEntities
                  .has(
                    entity
                  ) ||
                !roomsGetQuestItemForEntity(
                  entity
                )
              ) {
                return;
              }

              roomsCreateOrUpdateQuestHitbox(
                entity
              );

              if (
                !entity
                  .__roomsQuestHitboxRefresh
              ) {
                entity
                  .__roomsQuestHitboxRefresh =
                  () => {
                    roomsCreateOrUpdateQuestHitbox(
                      entity
                    );

                    this.expandRaycasters();
                  };

                entity.addEventListener(
                  'model-loaded',
                  entity
                    .__roomsQuestHitboxRefresh
                );
              }

              this.boundQuestEntities
                .add(
                  entity
                );
            }
          );
      },


    attachListeners:
      function () {
        this.scene
          .addEventListener(
            'rooms-pause-changed',
            this.onPauseChanged
          );

        this.scene
          .addEventListener(
            'enter-vr',
            this.onEnterVR
          );

        this.scene
          .addEventListener(
            'exit-vr',
            this.onExitVR
          );

        const incenseStick =
          document.querySelector(
            '#incenseStick'
          );

        if (incenseStick) {
          incenseStick
            .addEventListener(
              'incense-lit',
              this.onIncenseLit
            );
        }
      },


    /* ========================================================
       OBJECTIVE HUD
    ======================================================== */

    buildQuestUI:
      function () {
        const old =
          document.querySelector(
            '#roomsQuestTracker'
          );

        if (old) {
          old.remove();
        }

        this.questRows
          .clear();

        this.incenseRow =
          null;

        this.questProgressText =
          null;

        const root =
          roomsCreateEntity(
            'a-entity',
            {
              id:
                'roomsQuestTracker',

              position:
                ROOMS_DESCRIPTION_UI
                  .questPosition,

              visible:
                'false'
            }
          );

        /* ----------------------------------------------------
           SOFT DROP SHADOW

           A blurred, slightly larger rounded rectangle sitting
           behind the panel. Baked with Canvas2D since A-Frame
           planes have no native blur/shadow.
        ---------------------------------------------------- */

        const shadowTexture =
          roomsCreatePanelShadowTexture(
            {
              width: 600,
              height: 525,
              radius: 44,
              blur: 26,
              opacity: 0.45
            }
          );

        const shadowPlane =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.360',

              height:
                '0.322',

              position:
                '0.007 -0.007 -0.012',

              material:
                'shader: flat; transparent: true; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        root.appendChild(
          shadowPlane
        );

        /* ----------------------------------------------------
           PANEL

           Single rounded-rect plane (fill + border baked
           into one Canvas2D texture) instead of two flat
           stacked planes.
        ---------------------------------------------------- */

        const panelTexture =
          roomsCreateRoundedPanelTexture(
            {
              width: 600,
              height: 525,
              radius: 44,
              fillColor: '#15171c',
              fillOpacity: 0.86,
              strokeColor: '#454b55',
              strokeOpacity: 0.65,
              strokeWidth: 5
            }
          );

        const panel =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.304',

              height:
                '0.266',

              position:
                '0 0 0',

              material:
                'shader: flat; transparent: true; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        root.appendChild(
          panel
        );

        const header =
          roomsCreateText(
            'OBJECTIVES',
            '-0.126 0.094 0.008',
            '0.25',
            'left',
            '#e8ba6e',
            18
          );

        this.questProgressText =
          roomsCreateText(
            '0 / 3',
            '0.126 0.094 0.008',
            '0.12',
            'right',
            '#e8ba6e',
            10
          );

        root.append(
          header,
          this.questProgressText
        );

        /* ----------------------------------------------------
           STEP 1 — LIGHT THE INCENSE

           Always visible. Ticks once incense.js emits
           "incense-lit" on #incenseStick (see onIncenseLit).
        ---------------------------------------------------- */

        const incenseRowEntity =
          roomsCreateEntity(
            'a-entity',
            {
              position:
                '0 0.044 0.010'
            }
          );

        const incenseRing =
          roomsCreateEntity(
            'a-ring',
            {
              'radius-inner':
                '0.0060',

              'radius-outer':
                '0.0082',

              'segments-theta':
                '24',

              position:
                '-0.116 0 0',

              material:
                'color: #c9cbd0; opacity: 0.85; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        const incenseCheck =
          roomsCreateEntity(
            'a-entity',
            {
              position:
                '-0.116 0 0.002',

              visible:
                'false'
            }
          );

        const incenseCheckShort =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.010',

              height:
                '0.0032',

              position:
                '-0.003 -0.002 0',

              rotation:
                '0 0 -42',

              material:
                'color: #8fd6a0; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        const incenseCheckLong =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.017',

              height:
                '0.0032',

              position:
                '0.004 0.002 0',

              rotation:
                '0 0 48',

              material:
                'color: #8fd6a0; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        incenseCheck.append(
          incenseCheckShort,
          incenseCheckLong
        );

        const incenseLabel =
          roomsCreateText(
            'Light the incense',
            '-0.096 0 0',
            '0.215',
            'left',
            '#e9eaec',
            26
          );

        incenseRowEntity.append(
          incenseRing,
          incenseCheck,
          incenseLabel
        );

        root.appendChild(
          incenseRowEntity
        );

        this.incenseRow = {
          emptyCircle:
            incenseRing,

          check:
            incenseCheck
        };

        /* ----------------------------------------------------
           DIVIDER
        ---------------------------------------------------- */

        const divider =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.270',

              height:
                '0.0014',

              position:
                '0 0.014 0.006',

              material:
                'color: #454b55; opacity: 0.55; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        root.appendChild(
          divider
        );

        /* ----------------------------------------------------
           STEP 2 — FIND 3 ITEMS

           Rows stay hidden until the incense is lit.
           See updateQuestUI().
        ---------------------------------------------------- */

        const rowY = [
          -0.016,
          -0.066,
          -0.116
        ];

        ROOMS_QUEST_ITEMS
          .forEach(
            (
              item,
              index
            ) => {
              const row =
                roomsCreateEntity(
                  'a-entity',
                  {
                    position:
                      `0 ${rowY[index]} 0.010`,

                    visible:
                      'false'
                  }
                );

              const emptyCircle =
                roomsCreateEntity(
                  'a-ring',
                  {
                    'radius-inner':
                      '0.0060',

                    'radius-outer':
                      '0.0082',

                    'segments-theta':
                      '24',

                    position:
                      '-0.116 0 0',

                    material:
                      'color: #c9cbd0; opacity: 0.85; ' +
                      'transparent: true; shader: flat; ' +
                      'depthTest: false; depthWrite: false'
                  }
                );

              const check =
                roomsCreateEntity(
                  'a-entity',
                  {
                    position:
                      '-0.116 0 0.002',

                    visible:
                      'false'
                  }
                );

              const checkShort =
                roomsCreateEntity(
                  'a-plane',
                  {
                    width:
                      '0.010',

                    height:
                      '0.0032',

                    position:
                      '-0.003 -0.002 0',

                    rotation:
                      '0 0 -42',

                    material:
                      'color: #8fd6a0; shader: flat; ' +
                      'depthTest: false; depthWrite: false'
                  }
                );

              const checkLong =
                roomsCreateEntity(
                  'a-plane',
                  {
                    width:
                      '0.017',

                    height:
                      '0.0032',

                    position:
                      '0.004 0.002 0',

                    rotation:
                      '0 0 48',

                    material:
                      'color: #8fd6a0; shader: flat; ' +
                      'depthTest: false; depthWrite: false'
                  }
                );

              check.append(
                checkShort,
                checkLong
              );

              const label =
                roomsCreateText(
                  item.title,
                  '-0.096 0 0',
                  '0.215',
                  'left',
                  '#e9eaec',
                  22
                );

              row.append(
                emptyCircle,
                check,
                label
              );

              root.appendChild(
                row
              );

              this.questRows
                .set(
                  item.key,
                  {
                    emptyCircle,
                    check,
                    row
                  }
                );
            }
          );

        this.camera
          .appendChild(
            root
          );

        this.questRoot =
          root;

        roomsApplyCanvasTexture(
          shadowPlane,
          shadowTexture
        );

        roomsApplyCanvasTexture(
          panel,
          panelTexture
        );
      },


    /* ========================================================
       UNIVERSAL WORLD ACTION PROMPT

       Quest right-controller laser / Mac centre crosshair.
       One prompt surface is reused for every supported manual
       world interaction.
    ======================================================== */

    buildActionPrompt:
      function () {
        const old =
          document.querySelector(
            '#roomsActionPrompt'
          );

        if (old) {
          old.remove();
        }

        const root =
          roomsCreateEntity(
            'a-entity',
            {
              id:
                'roomsActionPrompt',

              position:
                ROOMS_DESCRIPTION_UI
                  .actionPromptPosition,

              visible:
                'false'
            }
          );

        const background =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.255',

              height:
                '0.062',

              position:
                '0 0 0',

              material:
                'color: #0d0f12; opacity: 0.72; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        this.actionText =
          roomsCreateText(
            '',
            '0 0 0.006',
            '0.30',
            'center',
            '#ffffff',
            24
          );

        root.append(
          background,
          this.actionText
        );

        this.camera
          .appendChild(
            root
          );

        this.actionRoot =
          root;
      },


    setActionPrompt:
      function (
        label
      ) {
        const nextLabel =
          String(
            label || ''
          );

        if (
          nextLabel ===
          this.actionPromptLabel
        ) {
          return;
        }

        this.actionPromptLabel =
          nextLabel;

        if (
          !this.actionRoot ||
          !this.actionText
        ) {
          return;
        }

        if (!nextLabel) {
          roomsSetVisible(
            this.actionRoot,
            false
          );

          return;
        }

        this.actionText
          .setAttribute(
            'value',
            nextLabel
          );

        roomsSetVisible(
          this.actionRoot,
          true
        );
      },


    updateActionPrompt:
      function () {
        /*
          Defensive cleanup for old incense.js versions.
          The universal prompt below is the one we keep.
        */
        roomsHideLegacyIncenseTooltip();

        if (
          window.roomsPaused ||
          window.roomsInputLocked
        ) {
          this.setActionPrompt(
            ''
          );

          return;
        }

        const ray =
          roomsPromptsImmersiveXR(
            this.scene
          )
            ? this.rightHand
            : this.desktopCursor;

        const target =
          roomsGetActionTarget(
            ray
          );

        this.setActionPrompt(
          roomsGetActionPromptText(
            target
          )
        );
      },


    /* ========================================================
       DELAYED WORLD-SPACE QUEST ITEM DESCRIPTION
    ======================================================== */

    buildHoverDescriptionUI:
      function () {
        const old =
          document.querySelector(
            '#roomsHoverDescription'
          );

        if (old) {
          old.remove();
        }

        const root =
          roomsCreateEntity(
            'a-entity',
            {
              id:
                'roomsHoverDescription',

              visible:
                'false'
            }
          );

        const border =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.58',

              height:
                '0.255',

              position:
                '0 0 -0.004',

              material:
                'color: #d7d7d7; opacity: 0.24; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false; side: double'
            }
          );

        const background =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.57',

              height:
                '0.245',

              position:
                '0 0 0',

              material:
                'color: #101216; opacity: 0.90; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false; side: double'
            }
          );

        this.hoverTitle =
          roomsCreateText(
            '',
            '-0.245 0.078 0.012',
            '0.48',
            'left',
            '#ffffff',
            22
          );

        const divider =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.49',

              height:
                '0.003',

              position:
                '0 0.036 0.012',

              material:
                'color: #9ca3ad; opacity: 0.46; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        this.hoverDescription =
          roomsCreateText(
            '',
            '-0.245 0.002 0.012',
            '0.49',
            'left',
            '#dedede',
            39
          );

        root.append(
          border,
          background,
          this.hoverTitle,
          divider,
          this.hoverDescription
        );

        /*
          Scene child instead of camera child.
          That makes the description stay beside the real object.
        */
        this.scene.appendChild(
          root
        );

        this.hoverRoot =
          root;
      },


    getHoverRay:
      function () {
        return roomsPromptsImmersiveXR(
          this.scene
        )
          ? this.rightHand
          : this.desktopCursor;
      },


    hideHoverDescription:
      function (
        resetTarget = true
      ) {
        if (
          this.hoverRoot
        ) {
          roomsSetVisible(
            this.hoverRoot,
            false
          );
        }

        roomsPromptState
          .hoverVisible =
          false;

        if (
          resetTarget
        ) {
          roomsPromptState
            .hoverEntity =
            null;

          roomsPromptState
            .hoverItem =
            null;

          roomsPromptState
            .hoverStartedAt =
            0;
        }
      },


    showHoverDescription:
      function (
        entity,
        item
      ) {
        if (
          !entity ||
          !item ||
          !this.hoverRoot
        ) {
          return false;
        }

        this.hoverTitle
          .setAttribute(
            'value',
            item.title
          );

        this.hoverDescription
          .setAttribute(
            'value',
            item.description
          );

        roomsPromptState
          .hoverEntity =
          entity;

        roomsPromptState
          .hoverItem =
          item;

        roomsPromptState
          .hoverVisible =
          true;

        /*
          This records that the player has SEEN the description.
          It does NOT check the quest item.
        */
        roomsPromptState
          .inspectedItems
          .add(
            item.key
          );

        this.updateHoverDescriptionTransform();

        roomsSetVisible(
          this.hoverRoot,
          true
        );

        /*
          Immediately hide the central INSPECT prompt.
          The description itself now becomes the only visible
          text associated with this item.
        */
        this.setActionPrompt(
          ''
        );

        return true;
      },


    updateHoverDescriptionTransform:
      function () {
        const entity =
          roomsPromptState
            .hoverEntity;

        if (
          !entity ||
          !this.hoverRoot ||
          !this.camera ||
          !roomsPromptState
            .hoverVisible
        ) {
          return;
        }

        const source =
          entity.getObject3D(
            'mesh'
          ) ||
          entity.object3D;

        if (!source) {
          return;
        }

        source.updateMatrixWorld(
          true
        );

        this.hoverBox
          .setFromObject(
            source
          );

        if (
          this.hoverBox
            .isEmpty()
        ) {
          entity.object3D
            .getWorldPosition(
              this.hoverCenter
            );

        } else {
          this.hoverBox
            .getCenter(
              this.hoverCenter
            );
        }

        this.camera.object3D
          .getWorldPosition(
            this.hoverCameraWorld
          );

        this.camera.object3D
          .getWorldQuaternion(
            this.hoverCameraQuaternion
          );

        this.hoverCameraRight
          .set(
            1,
            0,
            0
          )
          .applyQuaternion(
            this.hoverCameraQuaternion
          )
          .normalize();

        this.hoverToObject
          .subVectors(
            this.hoverCenter,
            this.hoverCameraWorld
          );

        /*
          Put the description on whichever side keeps it
          closer to the centre of the player's view.
        */
        const side =
          this.hoverToObject
            .dot(
              this.hoverCameraRight
            ) >
          0
            ? -1
            : 1;

        this.hoverWorldPosition
          .copy(
            this.hoverCenter
          )
          .addScaledVector(
            this.hoverCameraRight,

            ROOMS_DESCRIPTION_UI
              .hoverSideOffset *
              side
          );

        this.hoverWorldPosition.y +=
          ROOMS_DESCRIPTION_UI
            .hoverVerticalOffset;

        this.hoverRoot.object3D
          .position
          .copy(
            this.hoverWorldPosition
          );

        /*
          Always face the player's eyes.
        */
        this.hoverRoot.object3D
          .lookAt(
            this.hoverCameraWorld
          );

        const distance =
          this.hoverWorldPosition
            .distanceTo(
              this.hoverCameraWorld
            );

        const scale =
          THREE.MathUtils
            .clamp(
              distance / 1.65,
              0.72,
              1.25
            );

        this.hoverRoot.object3D
          .scale
          .setScalar(
            scale
          );
      },


    updateHoverDescription:
      function (
        time
      ) {
        /*
          Settings pause can hide it.
          Hover itself NEVER pauses the game.
        */
        if (
          window.roomsPaused ||
          window.roomsInputLocked
        ) {
          this.hideHoverDescription(
            true
          );

          return;
        }

        const ray =
          this.getHoverRay();

        const target =
          roomsGetRayTarget(
            ray
          );

        const item =
          roomsGetQuestItemForEntity(
            target
          );

        if (
          !target ||
          !item
        ) {
          this.hideHoverDescription(
            true
          );

          return;
        }

        /*
          New target = start a fresh dwell timer.
        */
        if (
          target !==
            roomsPromptState
              .hoverEntity ||
          item.key !==
            (
              roomsPromptState
                .hoverItem
                ? roomsPromptState
                    .hoverItem
                    .key
                : null
            )
        ) {
          this.hideHoverDescription(
            false
          );

          roomsPromptState
            .hoverEntity =
            target;

          roomsPromptState
            .hoverItem =
            item;

          roomsPromptState
            .hoverStartedAt =
            time;

          return;
        }

        /*
          Same item:
          wait until 1.5 seconds of continuous pointing has passed.
        */
        if (
          !roomsPromptState
            .hoverVisible
        ) {
          if (
            time -
              roomsPromptState
                .hoverStartedAt >=
            ROOMS_DESCRIPTION_UI
              .hoverDelay
          ) {
            this.showHoverDescription(
              target,
              item
            );
          }

          return;
        }

        /*
          It is already visible.
          Keep following the object.
        */
        this.updateHoverDescriptionTransform();
      },


    /* ========================================================
       PAUSE / VR EVENTS
    ======================================================== */

    onPauseChanged:
      function (
        event
      ) {
        const paused =
          Boolean(
            event &&
            event.detail &&
            event.detail.paused
          );

        if (paused) {
          this.hideHoverDescription(
            true
          );

          this.setActionPrompt(
            ''
          );
        }

        this.syncQuestVisibility();
      },


    onEnterVR:
      function () {
        [
          0,
          50,
          250,
          600
        ].forEach(
          (delay) => {
            window.setTimeout(
              () => {
                this.expandRaycasters();

                this.bindQuestItemClicks();

                this.syncQuestVisibility();
              },

              delay
            );
          }
        );
      },


    onExitVR:
      function () {
        this.hideHoverDescription(
          true
        );

        this.syncQuestVisibility();

        this.setActionPrompt(
          ''
        );
      },


    /* ========================================================
       BACKWARD COMPATIBILITY

       Older code may still call openRoomsItemInspection().
       It no longer opens a full-screen inspection.
    ======================================================== */

    openInspection:
      function (
        entity,
        item
      ) {
        if (
          !entity ||
          !item
        ) {
          return false;
        }

        roomsPromptState
          .hoverEntity =
          entity;

        roomsPromptState
          .hoverItem =
          item;

        roomsPromptState
          .hoverStartedAt =
          performance.now();

        return this
          .showHoverDescription(
            entity,
            item
          );
      },


    closeInspection:
      function () {
        this.hideHoverDescription(
          true
        );

        roomsPromptState
          .inspectionOpen =
          false;

        roomsPromptState
          .inspectedEntity =
          null;

        roomsPromptState
          .inspectedItem =
          null;

        window.roomsInspectionOpen =
          false;

        return true;
      },


    /* ========================================================
       QUEST PROGRESS

       IMPORTANT:
       HOVERING DOES NOT CHECK THE ITEM.

       story.js controls this after:
       grab -> release -> rest on #truocbantho.
    ======================================================== */

    setQuestItemChecked:
      function (
        itemOrKey,
        checked
      ) {
        const key =
          typeof itemOrKey ===
            'string'
            ? itemOrKey
            : (
                itemOrKey &&
                itemOrKey.key
                  ? itemOrKey.key
                  : ''
              );

        if (!key) {
          return false;
        }

        const item =
          ROOMS_QUEST_ITEMS
            .find(
              (candidate) =>
                candidate.key ===
                key
            );

        if (!item) {
          return false;
        }

        const shouldCheck =
          checked !==
          false;

        const wasChecked =
          roomsPromptState
            .foundItems
            .has(
              key
            );

        if (
          shouldCheck
        ) {
          roomsPromptState
            .foundItems
            .add(
              key
            );

        } else {
          roomsPromptState
            .foundItems
            .delete(
              key
            );
        }

        this.updateQuestUI();

        if (
          shouldCheck ===
          wasChecked
        ) {
          return true;
        }

        const detail = {
          key,

          title:
            item.title,

          checked:
            shouldCheck,

          found:
            roomsPromptState
              .foundItems
              .size,

          total:
            ROOMS_QUEST_ITEMS
              .length
        };

        if (
          shouldCheck
        ) {
          const story =
            document.querySelector(
              '#story-manager'
            );

          if (story) {
            story.emit(
              'quest-item-found',
              detail,
              false
            );
          }

          this.scene.emit(
            'quest-item-found',
            detail,
            false
          );

          if (
            roomsPromptState
              .foundItems
              .size >=
            ROOMS_QUEST_ITEMS
              .length
          ) {
            if (story) {
              story.emit(
                'quest-items-complete',
                detail,
                false
              );
            }

            this.scene.emit(
              'quest-items-complete',
              detail,
              false
            );
          }

        } else {
          this.scene.emit(
            'quest-item-unchecked',
            detail,
            false
          );
        }

        return true;
      },


    markQuestItemFound:
      function (
        item
      ) {
        return this
          .setQuestItemChecked(
            item,
            true
          );
      },


    onIncenseLit:
      function () {
        this.setIncenseLit(
          true
        );
      },


    setIncenseLit:
      function (
        lit
      ) {
        const value =
          Boolean(
            lit
          );

        if (
          roomsPromptState
            .incenseLit ===
          value
        ) {
          return;
        }

        roomsPromptState
          .incenseLit =
          value;

        this.updateQuestUI();
      },


    updateQuestUI:
      function () {
        const incenseLit =
          Boolean(
            roomsPromptState
              .incenseLit
          );

        if (
          this.incenseRow
        ) {
          roomsSetVisible(
            this.incenseRow
              .emptyCircle,
            !incenseLit
          );

          roomsSetVisible(
            this.incenseRow
              .check,
            incenseLit
          );
        }

        ROOMS_QUEST_ITEMS
          .forEach(
            (item) => {
              const row =
                this.questRows
                  .get(
                    item.key
                  );

              if (!row) {
                return;
              }

              if (
                row.row
              ) {
                roomsSetVisible(
                  row.row,
                  incenseLit
                );
              }

              const found =
                roomsPromptState
                  .foundItems
                  .has(
                    item.key
                  );

              roomsSetVisible(
                row.emptyCircle,
                !found
              );

              roomsSetVisible(
                row.check,
                found
              );
            }
          );

        if (
          this.questProgressText
        ) {
          this.questProgressText
            .setAttribute(
              'value',
              `${roomsPromptState.foundItems.size} / ${ROOMS_QUEST_ITEMS.length}`
            );
        }
      },


    /* ========================================================
       OBJECTIVE VISIBILITY
    ======================================================== */

    syncQuestVisibility:
      function () {
        if (
          !this.questRoot
        ) {
          return;
        }

        const immersive =
          roomsPromptsImmersiveXR(
            this.scene
          );

        const allowedMode =
          immersive ||
          ROOMS_DESCRIPTION_UI
            .showQuestTrackerOnDesktop;

        roomsSetVisible(
          this.questRoot,

          allowedMode &&
          !window.roomsPaused
        );
      },


    /* ========================================================
       FRAME UPDATE
    ======================================================== */

    tick:
      function (
        time,
        delta
      ) {
        /*
          Always suppress the old incense tooltip if an old
          incense.js happens to create it.
        */
        roomsHideLegacyIncenseTooltip();

        if (!delta) {
          return;
        }

        /*
          If the item moves while the card is open,
          keep the card following it.
        */
        if (
          roomsPromptState
            .hoverVisible
        ) {
          this.updateHoverDescriptionTransform();
        }

        this.actionScanElapsed +=
          delta;

        /*
          ~15 target checks per second.
        */
        if (
          this.actionScanElapsed <
          65
        ) {
          return;
        }

        this.actionScanElapsed =
          0;

        /*
          First update the hover state so that if the
          description just opened, the central INSPECT
          prompt can be hidden immediately afterward.
        */
        this.updateHoverDescription(
          time
        );

        this.updateActionPrompt();
      },


    /* ========================================================
       CLEANUP
    ======================================================== */

    remove:
      function () {
        this.boundQuestEntities
          .forEach(
            (entity) => {
              if (
                entity
                  .__roomsQuestHitboxRefresh
              ) {
                entity
                  .removeEventListener(
                    'model-loaded',
                    entity
                      .__roomsQuestHitboxRefresh
                  );

                delete entity
                  .__roomsQuestHitboxRefresh;
              }
            }
          );

        this.boundQuestEntities
          .clear();

        this.scene
          .removeEventListener(
            'rooms-pause-changed',
            this.onPauseChanged
          );

        this.scene
          .removeEventListener(
            'enter-vr',
            this.onEnterVR
          );

        this.scene
          .removeEventListener(
            'exit-vr',
            this.onExitVR
          );

        this.hideHoverDescription(
          true
        );

        this.setActionPrompt(
          ''
        );

        if (
          this.hoverRoot &&
          this.hoverRoot
            .parentNode
        ) {
          this.hoverRoot
            .parentNode
            .removeChild(
              this.hoverRoot
            );
        }

        this.hoverRoot =
          null;

        if (
          this.actionRoot &&
          this.actionRoot
            .parentNode
        ) {
          this.actionRoot
            .parentNode
            .removeChild(
              this.actionRoot
            );
        }

        this.actionRoot =
          null;

        this.actionText =
          null;

        if (
          this.questRoot &&
          this.questRoot
            .parentNode
        ) {
          this.questRoot
            .parentNode
            .removeChild(
              this.questRoot
            );
        }

        this.questRoot =
          null;

        if (
          roomsPromptState
            .system ===
          this
        ) {
          roomsPromptState
            .system =
            null;
        }
      }
  }
);


/* ============================================================
   GLOBAL QUEST DEBUG / STORY HELPERS
============================================================ */

window.getRoomsQuestState =
  function () {
    return {
      /*
        inspected =
        descriptions the player has hovered long enough to see.

        found / checked =
        items story.js has confirmed on #truocbantho.
      */
      inspected:
        Array.from(
          roomsPromptState
            .inspectedItems
        ),

      found:
        Array.from(
          roomsPromptState
            .foundItems
        ),

      checked:
        Array.from(
          roomsPromptState
            .foundItems
        ),

      total:
        ROOMS_QUEST_ITEMS
          .length,

      complete:
        roomsPromptState
          .foundItems
          .size >=
        ROOMS_QUEST_ITEMS
          .length,

      inspectionOpen:
        false,

      hoverVisible:
        roomsPromptState
          .hoverVisible,

      hoverItem:
        roomsPromptState
          .hoverItem
          ? roomsPromptState
              .hoverItem
              .key
          : null
    };
  };


window.setRoomsQuestItemChecked =
  function (
    key,
    checked = true
  ) {
    const system =
      roomsPromptState
        .system;

    if (
      !system ||
      typeof system
        .setQuestItemChecked !==
        'function'
    ) {
      return false;
    }

    return system
      .setQuestItemChecked(
        key,
        checked
      );
  };


/*
  Kept so an older script calling this does not crash.

  It now shows the small hover description only.
  It never pauses the game.
*/
window.openRoomsItemInspection =
  function (
    entityOrSelector
  ) {
    const system =
      roomsPromptState
        .system;

    if (!system) {
      return false;
    }

    const entity =
      typeof entityOrSelector ===
        'string'
        ? document.querySelector(
            entityOrSelector
          )
        : entityOrSelector;

    const item =
      roomsGetQuestItemForEntity(
        entity
      );

    if (
      !entity ||
      !item
    ) {
      return false;
    }

    return system
      .openInspection(
        entity,
        item
      );
  };


window.closeRoomsItemInspection =
  function () {
    const system =
      roomsPromptState
        .system;

    if (!system) {
      return false;
    }

    return system
      .closeInspection();
  };


/* ============================================================
   STARTUP
============================================================ */

window.addEventListener(
  'DOMContentLoaded',
  () => {
    const scene =
      document.querySelector(
        'a-scene'
      );

    if (!scene) {
      console.warn(
        'Rooms Within interaction UI: no <a-scene> found.'
      );

      return;
    }

    if (
      !scene.hasAttribute(
        'rooms-object-info-ui'
      )
    ) {
      scene.setAttribute(
        'rooms-object-info-ui',
        ''
      );
    }
  }
);