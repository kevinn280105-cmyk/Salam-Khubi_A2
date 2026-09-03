/* interaction-prompts.js — ROOMS WITHIN
   Full replacement.

   Quest items:
   - Mac first LEFT CLICK = open info only; checklist does NOT tick yet.
   - Uses direct camera-ray mousedown detection so invisible hitboxes are reliable.
   - Mac later LEFT CLICK = normal natural-grabbable pickup/drop.
   - Mac MIDDLE MOUSE = reopen info.
   - Mac info screen freezes camera and uses the real mouse pointer.
   - Mac LEFT CLICK on RED X = close info + resume.
   - Quest TRIGGER = open info.
   - Quest GRIP/SQUEEZE = physical pickup via natural-grab-hand.

   Hover / aim prompts:
   - Quest items = item name only (TEDDY BEAR / HAIR CLIPPER / PICTURE).
   - Invisible enlarged aim hitboxes make small GLBs easier to target.
   - TV = TURN ON TV / TURN OFF TV.
   - Altar = LIGHT THE INCENSE.
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
  inspectionPosition: '0 0 -0.90',
  showQuestTrackerOnDesktop: true
};

const roomsPromptState = {
  system: null,
  inspectionOpen: false,
  inspectedEntity: null,
  inspectedItem: null,

  /*
    inspectedItems controls the first-click information behavior.
    A quest item becomes "inspected" after its information panel
    has been opened once. This does NOT tick the checklist.
  */
  inspectedItems: new Set(),

  /*
    foundItems now represents the CHECKLIST state only.
    story.js sets these when the real physical objects are
    placed on #truocbantho.
  */
  foundItems: new Set(),

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
  const el = document.createElement(tag);

  Object.entries(attrs).forEach(([name, value]) => {
    el.setAttribute(name, value);
  });

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
  return roomsCreateEntity('a-text', {
    value: value || '',
    position,
    width,
    align,
    color,
    'wrap-count': String(wrapCount),
    side: 'double',
    material: 'shader: flat; depthTest: false; depthWrite: false'
  });
}


/* ============================================================
   QUEST ITEM INVISIBLE AIM HITBOXES

   The GLB itself can be small or have gaps between its meshes.
   These boxes are invisible, follow the real object, and make
   hover / Trigger / first-click inspection much easier.

   They DO NOT replace the real object:
   - Quest Grip still grabs the real natural-grabbable entity.
   - Mac clicks after inspection still pick up/drop the real object.
============================================================ */

function roomsGetEntityLocalModelBox(entity) {
  if (!entity) return null;

  const root = entity.getObject3D('mesh');

  if (!root) return null;

  entity.object3D.updateMatrixWorld(true);
  root.updateMatrixWorld(true);

  const inverseEntityWorld = new THREE.Matrix4()
    .copy(entity.object3D.matrixWorld)
    .invert();

  const box = new THREE.Box3();

  box.makeEmpty();

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (!node.geometry.boundingBox) {
      node.geometry.computeBoundingBox();
    }

    if (!node.geometry.boundingBox) {
      return;
    }

    const toEntityLocal = new THREE.Matrix4()
      .multiplyMatrices(
        inverseEntityWorld,
        node.matrixWorld
      );

    box.union(
      node.geometry.boundingBox
        .clone()
        .applyMatrix4(toEntityLocal)
    );
  });

  return box.isEmpty()
    ? null
    : box;
}

function roomsQuestHitboxSettings(item) {
  if (!item) {
    return {
      scale: 1.55,
      minX: 0.22,
      minY: 0.22,
      minZ: 0.18
    };
  }

  if (item.key === 'teddy') {
    return {
      scale: 1.70,
      minX: 0.30,
      minY: 0.34,
      minZ: 0.26
    };
  }

  if (item.key === 'hair-clipper') {
    return {
      scale: 1.75,
      minX: 0.24,
      minY: 0.24,
      minZ: 0.20
    };
  }

  if (item.key === 'picture') {
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

function roomsCreateOrUpdateQuestHitbox(entity) {
  const item =
    roomsGetQuestItemForEntity(entity);

  if (!entity || !item) {
    return null;
  }

  let hitbox = null;

  for (const child of entity.children || []) {
    if (
      child.classList &&
      child.classList.contains('quest-hover-hitbox')
    ) {
      hitbox = child;
      break;
    }
  }

  if (!hitbox) {
    hitbox =
      roomsCreateEntity(
        'a-box',
        {
          class: 'quest-hover-hitbox',
          visible: 'true',
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
      A click can land on the invisible box instead of the GLB.
      Handle that explicitly so info + pickup both remain reliable.
    */
    hitbox.addEventListener(
      'click',
      (event) => {
        if (
          roomsPromptsImmersiveXR(entity.sceneEl) ||
          roomsPromptState.inspectionOpen ||
          window.roomsPaused ||
          window.roomsInputLocked
        ) {
          return;
        }

        if (event.preventDefault) {
          event.preventDefault();
        }

        if (event.stopPropagation) {
          event.stopPropagation();
        }

        if (event.stopImmediatePropagation) {
          event.stopImmediatePropagation();
        }

        const system =
          roomsPromptState.system;

        if (!system) {
          return;
        }

        if (
          !roomsPromptState
            .inspectedItems
            .has(item.key)
        ) {
          system.openInspection(
            entity,
            item
          );

          return;
        }

        /*
          Already inspected: perform the same Mac pickup/drop action
          that natural-grabbable normally performs on the real entity.
        */
        const grabbable =
          entity.components &&
          entity.components[
            'natural-grabbable'
          ];

        if (
          grabbable &&
          typeof grabbable.onDesktopClick ===
            'function'
        ) {
          grabbable.onDesktopClick();
        }
      }
    );

    entity.appendChild(hitbox);
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

  hitbox.object3D.position.copy(
    center
  );

  hitbox.setAttribute(
    'width',
    Math.max(
      size.x * settings.scale,
      settings.minX
    )
  );

  hitbox.setAttribute(
    'height',
    Math.max(
      size.y * settings.scale,
      settings.minY
    )
  );

  hitbox.setAttribute(
    'depth',
    Math.max(
      size.z * settings.scale,
      settings.minZ
    )
  );

  return hitbox;
}


/* ============================================================
   QUEST ITEM LOOKUP
============================================================ */

function roomsGetQuestItemForEntity(el) {
  if (!el) {
    return null;
  }

  for (const item of ROOMS_QUEST_ITEMS) {
    if (
      item.selectors.some(
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

function roomsFindQuestAncestor(el) {
  let current = el;

  while (
    current &&
    current.tagName &&
    current.tagName.toLowerCase() !==
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

function roomsFindInspectionControl(el) {
  let current = el;

  while (
    current &&
    current.tagName &&
    current.tagName.toLowerCase() !==
      'a-scene'
  ) {
    if (
      current.id ===
        'roomsInspectionClose' ||
      (
        current.classList &&
        current.classList.contains(
          'inspection-control'
        )
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
    const control =
      roomsFindInspectionControl(
        intersection.el
      );

    if (control) {
      return control;
    }

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
      const control =
        roomsFindInspectionControl(
          object.el
        );

      if (control) {
        return control;
      }

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

function roomsGetRayTarget(rayEntity) {
  if (
    !rayEntity ||
    !rayEntity.components ||
    !rayEntity.components.raycaster
  ) {
    return null;
  }

  const raycaster =
    rayEntity.components.raycaster;

  if (
    raycaster.refreshObjects
  ) {
    raycaster.refreshObjects();
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
    const control =
      roomsFindInspectionControl(
        el
      );

    if (control) {
      return control;
    }

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
      .split(',')
      .map(
        (value) =>
          value.trim()
      )
      .filter(Boolean);

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
    selectors.join(', ')
  );

  const component =
    rayEntity.components &&
    rayEntity.components.raycaster;

  if (
    component &&
    component.refreshObjects
  ) {
    component.refreshObjects();
  }
}


/* ============================================================
   TV / INCENSE PROMPTS
============================================================ */

function roomsActionTypeForElement(el) {
  let current = el;

  while (
    current &&
    current.tagName &&
    current.tagName.toLowerCase() !==
      'a-scene'
  ) {
    if (
      current.id === 'tv' ||
      (
        current.classList &&
        current.classList.contains(
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
          current.classList.contains(
            'offering-smoke-hitbox'
          ) ||
          current.classList.contains(
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
    !rayEntity.components.raycaster
  ) {
    return null;
  }

  const raycaster =
    rayEntity.components.raycaster;

  if (
    raycaster.refreshObjects
  ) {
    raycaster.refreshObjects();
  }

  const intersections =
    raycaster.intersections || [];

  if (!intersections.length) {
    return null;
  }

  /*
    Scan intersections from nearest to farthest and return the first
    interaction we actually understand. This is more reliable than
    checking intersections[0] only, because a GLB can contain several
    meshes and the invisible quest hitbox can sit just behind one.
  */
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
        type: 'quest-item',
        entity: questEntity,
        item: questItem,
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
    tv.components['embedded-tv']
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
    living.components['embedded-tv']
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
    Quest items only show their NAME while aimed at.
    Clicking / Trigger is still what opens the full information.
  */
  if (
    target.type ===
      'quest-item' &&
    target.item
  ) {
    return target.item.title;
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
   MAC INFO-PANEL POINTER RAYCAST

   During item inspection on Mac, the camera is frozen and the
   real mouse pointer is used. This ray is built from event.clientX
   / event.clientY instead of the centre A-Frame crosshair.
============================================================ */

function roomsDesktopPointerHitsEntity(
  event,
  scene,
  entity
) {
  if (
    !event ||
    !scene ||
    !scene.renderer ||
    !entity
  ) {
    return false;
  }

  const canvas =
    scene.renderer.domElement;

  const camera =
    scene.camera ||
    (
      document.querySelector(
        '#cam'
      ) &&
      document
        .querySelector(
          '#cam'
        )
        .getObject3D(
          'camera'
        )
    );

  if (
    !canvas ||
    !camera
  ) {
    return false;
  }

  const rect =
    canvas.getBoundingClientRect();

  if (
    !rect ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return false;
  }

  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return false;
  }

  const pointer =
    new THREE.Vector2(
      (
        (
          event.clientX -
          rect.left
        ) /
        rect.width
      ) * 2 - 1,

      -(
        (
          event.clientY -
          rect.top
        ) /
        rect.height
      ) * 2 + 1
    );

  const raycaster =
    new THREE.Raycaster();

  raycaster.setFromCamera(
    pointer,
    camera
  );

  entity.object3D
    .updateWorldMatrix(
      true,
      true
    );

  return (
    raycaster
      .intersectObject(
        entity.object3D,
        true
      )
      .length > 0
  );
}


/* ============================================================
   MAIN COMPONENT
============================================================ */

AFRAME.registerComponent(
  'rooms-object-info-ui',
  {
    init: function () {
      this.scene =
        this.el.sceneEl;

      this.camera = null;
      this.desktopCursor = null;
      this.rightHand = null;

      this.questRoot = null;
      this.questRows =
        new Map();

      this.actionRoot = null;
      this.actionText = null;
      this.actionPromptLabel = '';
      this.actionScanElapsed = 0;

      this.inspectionRoot = null;
      this.inspectTitle = null;
      this.inspectDescription = null;
      this.inspectClose = null;
      this.inspectPreviewHolder = null;
      this.previewObject = null;

      /*
        Mac inspection-pointer state.
      */
      this.savedCanvasCursor = null;
      this.desktopCursorWasVisible =
        true;

      this.boundQuestEntities =
        new Set();

      this.onQuestEntityClick =
        this.onQuestEntityClick
          .bind(this);

      this.onRightTrigger =
        this.onRightTrigger
          .bind(this);

      this.onDesktopMouseDown =
        this.onDesktopMouseDown
          .bind(this);

      this.onAuxClick =
        this.onAuxClick
          .bind(this);

      this.onKeyDown =
        this.onKeyDown
          .bind(this);

      this.onPauseChanged =
        this.onPauseChanged
          .bind(this);

      this.onEnterVR =
        this.onEnterVR
          .bind(this);

      this.onExitVR =
        this.onExitVR
          .bind(this);

      this.prepare =
        this.prepare.bind(this);

      roomsPromptState.system =
        this;

      if (
        this.scene.hasLoaded
      ) {
        this.prepare();
      } else {
        this.scene.addEventListener(
          'loaded',
          this.prepare,
          {
            once: true
          }
        );
      }
    },


    /* ========================================================
       SETUP
    ======================================================== */

    prepare: function () {
      this.camera =
        document.querySelector(
          '#cam'
        ) ||
        document.querySelector(
          '[camera]'
        );

      this.desktopCursor =
        this.camera
          ? this.camera.querySelector(
              'a-cursor'
            )
          : document.querySelector(
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
      this.buildInspectionUI();

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
        'Rooms Within quest + pickup + enlarged hover hitboxes + TV/incense prompts ready.'
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
              '.inspection-control',
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
       QUEST CLICK BINDINGS
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
        ].join(', ');

        document
          .querySelectorAll(
            selector
          )
          .forEach(
            (entity) => {
              if (
                this.boundQuestEntities
                  .has(entity) ||
                !roomsGetQuestItemForEntity(
                  entity
                )
              ) {
                return;
              }

              /*
                Build a larger invisible target around the real GLB.
                It follows the object automatically because it is a child
                of the real Teddy / Hair Clipper / Picture entity.
              */
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

              /*
                Capture phase lets the FIRST direct GLB click open info before
                natural-grabbable runs.

                Once found, our click handler simply returns and the
                normal natural-grabbable click continues.
              */
              entity.addEventListener(
                'click',
                this.onQuestEntityClick,
                true
              );

              this.boundQuestEntities
                .add(entity);
            }
          );
      },


    attachListeners:
      function () {
        if (
          this.rightHand
        ) {
          this.rightHand
            .addEventListener(
              'triggerdown',
              this.onRightTrigger
            );
        }

        document.addEventListener(
          'mousedown',
          this.onDesktopMouseDown,
          true
        );

        document.addEventListener(
          'auxclick',
          this.onAuxClick,
          true
        );

        document.addEventListener(
          'keydown',
          this.onKeyDown
        );

        this.scene.addEventListener(
          'rooms-pause-changed',
          this.onPauseChanged
        );

        this.scene.addEventListener(
          'enter-vr',
          this.onEnterVR
        );

        this.scene.addEventListener(
          'exit-vr',
          this.onExitVR
        );

        if (
          this.inspectClose
        ) {
          this.inspectClose
            .addEventListener(
              'click',
              () =>
                this.closeInspection()
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

        this.questRows.clear();

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

        const border =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.304',

              height:
                '0.204',

              position:
                '0 0 -0.003',

              material:
                'color: #d9d9d9; opacity: 0.22; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        const background =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.298',

              height:
                '0.198',

              position:
                '0 0 0',

              material:
                'color: #111318; opacity: 0.76; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        const header =
          roomsCreateText(
            'FIND 3 ITEMS',
            '-0.126 0.070 0.008',
            '0.25',
            'left',
            '#ffffff',
            18
          );

        root.append(
          border,
          background,
          header
        );

        const rowY = [
          0.020,
          -0.030,
          -0.080
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
                      `0 ${rowY[index]} 0.010`
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
                      'color: #d7d9dd; opacity: 0.90; ' +
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
                      'color: #ffffff; shader: flat; ' +
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
                      'color: #ffffff; shader: flat; ' +
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
                  '#e7e7e7',
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

              this.questRows.set(
                item.key,
                {
                  emptyCircle,
                  check
                }
              );
            }
          );

        /*
          Child of #cam = follows Mac camera / Quest headset.
        */
        this.camera.appendChild(
          root
        );

        this.questRoot =
          root;
      },


    /* ========================================================
       ITEM NAME / TV / INCENSE ACTION PROMPT
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

        this.camera.appendChild(
          root
        );

        this.actionRoot =
          root;
      },


    setActionPrompt:
      function (label) {
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
        roomsHideLegacyIncenseTooltip();

        if (
          roomsPromptState
            .inspectionOpen ||
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
       ITEM INFO PANEL
    ======================================================== */

    buildInspectionUI:
      function () {
        const old =
          document.querySelector(
            '#roomsInspectionUI'
          );

        if (old) {
          old.remove();
        }

        const root =
          roomsCreateEntity(
            'a-entity',
            {
              id:
                'roomsInspectionUI',

              position:
                ROOMS_DESCRIPTION_UI
                  .inspectionPosition,

              visible:
                'false'
            }
          );

        const blackout =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '2.30',

              height:
                '1.45',

              position:
                '0 0 -0.025',

              material:
                'color: #000000; opacity: 0.72; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        const panelBorder =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.93',

              height:
                '0.53',

              position:
                '0 0 -0.004',

              material:
                'color: #d7d7d7; opacity: 0.30; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        const panel =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.92',

              height:
                '0.52',

              position:
                '0 0 0',

              material:
                'color: #111318; opacity: 0.96; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        this.inspectPreviewHolder =
          roomsCreateEntity(
            'a-entity',
            {
              id:
                'roomsInspectionPreview',

              position:
                '-0.255 -0.005 0.050'
            }
          );

        this.inspectTitle =
          roomsCreateText(
            '',
            '0.005 0.155 0.035',
            '0.36',
            'left',
            '#ffffff',
            19
          );

        const divider =
          roomsCreateEntity(
            'a-plane',
            {
              width:
                '0.355',

              height:
                '0.003',

              position:
                '0.18 0.105 0.035',

              material:
                'color: #9ca3ad; opacity: 0.50; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        this.inspectDescription =
          roomsCreateText(
            '',
            '0.005 0.070 0.035',
            '0.355',
            'left',
            '#dedede',
            36
          );

        /*
          .vr-control means ui-scare.js keeps the X raycastable
          while the rest of the game is paused.
        */
        const closeButton =
          roomsCreateEntity(
            'a-plane',
            {
              id:
                'roomsInspectionClose',

              class:
                'vr-control inspection-control',

              width:
                '0.075',

              height:
                '0.075',

              position:
                '0.405 0.215 0.055',

              material:
                'color: #d32f2f; opacity: 0.98; ' +
                'transparent: true; shader: flat; ' +
                'depthTest: false; depthWrite: false'
            }
          );

        closeButton.appendChild(
          roomsCreateText(
            'X',
            '0 0 0.008',
            '0.20',
            'center',
            '#ffffff',
            3
          )
        );

        root.append(
          blackout,
          panelBorder,
          panel,
          this.inspectPreviewHolder,
          this.inspectTitle,
          divider,
          this.inspectDescription,
          closeButton
        );

        this.camera.appendChild(
          root
        );

        this.inspectionRoot =
          root;

        this.inspectClose =
          closeButton;
      },


    /* ========================================================
       MAC LEFT CLICK

       First click:
         info opens.

       Later click:
         handler returns without stopping the event,
         so natural-grabbable gets the click.
    ======================================================== */

    onQuestEntityClick:
      function (event) {
        if (
          roomsPromptsImmersiveXR(
            this.scene
          ) ||
          roomsPromptState
            .inspectionOpen ||
          window.roomsPaused
        ) {
          return;
        }

        const entity =
          roomsFindQuestAncestor(
            event.currentTarget ||
            event.target
          );

        const item =
          roomsGetQuestItemForEntity(
            entity
          );

        if (
          !entity ||
          !item
        ) {
          return;
        }

        /*
          ALREADY INSPECTED:
          allow natural-grabbable to handle pickup/drop.
        */
        if (
          roomsPromptState
            .inspectedItems
            .has(item.key)
        ) {
          return;
        }

        /*
          FIRST CLICK:
          prevent physical pickup this one time
          and open the info instead.
        */
        if (
          event.preventDefault
        ) {
          event.preventDefault();
        }

        if (
          event.stopPropagation
        ) {
          event.stopPropagation();
        }

        if (
          event.stopImmediatePropagation
        ) {
          event.stopImmediatePropagation();
        }

        this.openInspection(
          entity,
          item
        );
      },


    /* ========================================================
       MAC MOUSE INPUT

       This is the reliable fix for the invisible hitbox.

       LEFT CLICK on an uninspected quest item:
         -> use the camera ray directly
         -> open info immediately on mousedown
         -> the pause starts before natural-grabbable's click event

       LEFT CLICK after inspection:
         -> do nothing here
         -> normal natural-grabbable click is allowed through

       MIDDLE MOUSE:
         -> reopen info at any time
    ======================================================== */

    onDesktopMouseDown:
      function (event) {
        if (
          roomsPromptsImmersiveXR(
            this.scene
          )
        ) {
          return;
        }

        /*
          ========================================================
          INFO PANEL OPEN — REAL MAC MOUSE POINTER
          ========================================================

          The info panel and centre crosshair both follow #cam.
          Therefore the centre crosshair can never move onto a
          top-right X.

          While inspection is open we instead cast a THREE.Raycaster
          from the actual Mac mouse coordinates.

          Camera look is frozen by pauseGameForInspection(), so the
          pointer can move independently over the red X.
        */
        if (
          roomsPromptState
            .inspectionOpen
        ) {
          if (
            event.button !== 0
          ) {
            return;
          }

          const clickedRedX =
            roomsDesktopPointerHitsEntity(
              event,
              this.scene,
              this.inspectClose
            );

          if (
            clickedRedX
          ) {
            event.preventDefault();
            event.stopPropagation();

            if (
              event
                .stopImmediatePropagation
            ) {
              event
                .stopImmediatePropagation();
            }

            this.closeInspection();
          }

          return;
        }

        /*
          Normal gameplay still uses the centre A-Frame crosshair.
        */
        if (
          !this.desktopCursor ||
          window.roomsPaused ||
          window.roomsInputLocked
        ) {
          return;
        }

        if (
          event.button !== 0 &&
          event.button !== 1
        ) {
          return;
        }

        const target =
          roomsGetRayTarget(
            this.desktopCursor
          );

        const item =
          roomsGetQuestItemForEntity(
            target
          );

        if (
          !target ||
          !item
        ) {
          return;
        }

        /*
          Middle mouse:
          reopen information at any time.
        */
        if (
          event.button === 1
        ) {
          event.preventDefault();
          event.stopPropagation();

          this.openInspection(
            target,
            item
          );

          return;
        }

        /*
          After inspection:
          let the normal A-Frame click continue to natural-grabbable.
        */
        if (
          roomsPromptState
            .inspectedItems
            .has(item.key)
        ) {
          return;
        }

        /*
          First left click:
          open information.
        */
        event.preventDefault();
        event.stopPropagation();

        this.openInspection(
          target,
          item
        );
      },


    onAuxClick:
      function (event) {
        if (
          event.button === 1
        ) {
          event.preventDefault();
        }
      },


    /* ========================================================
       QUEST TRIGGER = INFO

       Quest physical pickup is NOT handled here.
       engine-interactions.js natural-grab-hand keeps:
         gripdown / squeezestart / gripchanged
       for physical grabbing.
    ======================================================== */

    onRightTrigger:
      function (event) {
        if (
          !roomsPromptsImmersiveXR(
            this.scene
          )
        ) {
          return;
        }

        /*
          Description open:
          Trigger only closes when pointing at X.
        */
        if (
          roomsPromptState
            .inspectionOpen
        ) {
          const target =
            roomsGetRayTarget(
              this.rightHand
            );

          if (
            target ===
            this.inspectClose
          ) {
            if (
              event &&
              event.stopPropagation
            ) {
              event.stopPropagation();
            }

            this.closeInspection();
          }

          return;
        }

        if (
          window.roomsPaused
        ) {
          return;
        }

        const target =
          roomsGetRayTarget(
            this.rightHand
          );

        const item =
          roomsGetQuestItemForEntity(
            target
          );

        if (
          !target ||
          !item
        ) {
          return;
        }

        if (
          event &&
          event.stopPropagation
        ) {
          event.stopPropagation();
        }

        this.openInspection(
          target,
          item
        );
      },


    /* ========================================================
       KEYBOARD / PAUSE / XR
    ======================================================== */

    onKeyDown:
      function (event) {
        if (
          event.key ===
            'Escape' &&
          roomsPromptState
            .inspectionOpen &&
          !roomsPromptsImmersiveXR(
            this.scene
          )
        ) {
          event.preventDefault();

          this.closeInspection();
        }
      },


    onPauseChanged:
      function (event) {
        const paused =
          Boolean(
            event &&
            event.detail &&
            event.detail.paused
          );

        /*
          Keep info pause active until X / Escape closes it.
        */
        if (
          roomsPromptState
            .inspectionOpen &&
          !paused
        ) {
          window.setTimeout(
            () => {
              if (
                roomsPromptState
                  .inspectionOpen
              ) {
                this
                  .pauseGameForInspection();
              }
            },
            0
          );

          return;
        }

        this.syncQuestVisibility();

        if (
          paused
        ) {
          this.setActionPrompt(
            ''
          );
        }
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
        if (
          roomsPromptState
            .inspectionOpen
        ) {
          this.closeInspection();
        }

        this.syncQuestVisibility();

        this.setActionPrompt(
          ''
        );
      },


    /* ========================================================
       OPEN / CLOSE INFO
    ======================================================== */

    openInspection:
      function (
        entity,
        item
      ) {
        if (
          !entity ||
          !item ||
          !this.inspectionRoot ||
          roomsPromptState
            .inspectionOpen
        ) {
          return;
        }

        /*
          Set before setRoomsPaused(true), because the pause
          event is emitted immediately.
        */
        roomsPromptState
          .inspectionOpen =
            true;

        roomsPromptState
          .inspectedEntity =
            entity;

        roomsPromptState
          .inspectedItem =
            item;

        window.roomsInspectionOpen =
          true;

        this.setActionPrompt(
          ''
        );

        this.setInspectionText(
          item
        );

        this.setInspectionPreview(
          entity
        );

        /*
          Opening the info marks the item as INSPECTED only.

          IMPORTANT:
          The checklist does NOT tick here anymore.
          story.js ticks it only after the physical object has been
          grabbed and dropped onto #truocbantho.
        */
        roomsPromptState
          .inspectedItems
          .add(
            item.key
          );

        roomsSetVisible(
          this.inspectionRoot,
          true
        );

        this.syncQuestVisibility();

        this.pauseGameForInspection();

        this.syncQuestVisibility();

        this.scene.emit(
          'item-inspection-opened',
          {
            key:
              item.key,

            entity
          },
          false
        );
      },


    closeInspection:
      function () {
        if (
          !roomsPromptState
            .inspectionOpen
        ) {
          return;
        }

        const item =
          roomsPromptState
            .inspectedItem;

        roomsSetVisible(
          this.inspectionRoot,
          false
        );

        this.clearInspectionPreview();

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

        this.resumeGameAfterInspection();

        this.syncQuestVisibility();

        this.scene.emit(
          'item-inspection-closed',
          {
            key:
              item
                ? item.key
                : null
          },
          false
        );
      },


    /* ========================================================
       PAUSE / RESUME
    ======================================================== */

    pauseGameForInspection:
      function () {
        roomsPromptState
          .pausedByInspection =
            true;

        if (
          typeof window
            .setRoomsPaused ===
          'function'
        ) {
          window.setRoomsPaused(
            true
          );
        } else {
          window.roomsPaused =
            true;

          window.roomsInputLocked =
            true;

          const rig =
            document.querySelector(
              '#rig'
            );

          const leftHand =
            document.querySelector(
              '#leftHand'
            );

          const cam =
            document.querySelector(
              '#cam'
            );

          if (
            rig
          ) {
            rig.setAttribute(
              'movement-controls',
              'enabled',
              false
            );
          }

          if (
            leftHand
          ) {
            leftHand.setAttribute(
              'blink-controls',
              'enabled',
              false
            );
          }

          if (
            cam
          ) {
            cam.setAttribute(
              'look-controls',
              'enabled',
              false
            );
          }
        }

        /*
          MAC INSPECTION MODE

          Freeze camera look and release pointer lock so the actual
          Mac pointer can move independently over the info panel.

          The centre A-Frame cursor is hidden while the info screen
          is open because it is no longer the input method for the X.
        */
        if (
          !roomsPromptsImmersiveXR(
            this.scene
          )
        ) {
          const cam =
            document.querySelector(
              '#cam'
            );

          if (
            cam
          ) {
            cam.setAttribute(
              'look-controls',
              'enabled',
              false
            );
          }

          if (
            document
              .pointerLockElement &&
            document
              .exitPointerLock
          ) {
            try {
              document
                .exitPointerLock();
            } catch (
              error
            ) {
              /*
                Browser may reject exitPointerLock
                in some contexts.
              */
            }
          }

          const canvas =
            this.scene &&
            this.scene.renderer
              ? this.scene
                  .renderer
                  .domElement
              : null;

          if (
            canvas
          ) {
            if (
              this.savedCanvasCursor ===
              null
            ) {
              this.savedCanvasCursor =
                canvas.style.cursor ||
                '';
            }

            canvas.style.cursor =
              'default';
          }

          if (
            this.desktopCursor
          ) {
            this.desktopCursorWasVisible =
              this.desktopCursor
                .getAttribute(
                  'visible'
                ) !==
              false;

            this.desktopCursor
              .setAttribute(
                'visible',
                false
              );
          }
        }

        this.hideSettingsUIForInspection();

        this.setActionPrompt(
          ''
        );

        this.syncQuestVisibility();
      },


    resumeGameAfterInspection:
      function () {
        if (
          roomsPromptState
            .pausedByInspection
        ) {
          if (
            typeof window
              .setRoomsPaused ===
            'function'
          ) {
            window.setRoomsPaused(
              false
            );
          } else {
            window.roomsPaused =
              false;

            window.roomsInputLocked =
              false;

            const rig =
              document.querySelector(
                '#rig'
              );

            const leftHand =
              document.querySelector(
                '#leftHand'
              );

            const cam =
              document.querySelector(
                '#cam'
              );

            if (
              rig
            ) {
              /*
                Quest smooth locomotion is allowed in the current build.
                After an inspection closes, restore movement on both
                desktop and real immersive VR.
              */
              rig.setAttribute(
                'movement-controls',
                'enabled',
                true
              );
            }

            if (
              leftHand
            ) {
              leftHand.setAttribute(
                'blink-controls',
                'enabled',
                true
              );
            }

            if (
              cam &&
              !roomsPromptsImmersiveXR(
                this.scene
              )
            ) {
              cam.setAttribute(
                'look-controls',
                'enabled',
                true
              );
            }
          }
        }

        /*
          Restore normal Mac cursor/crosshair behavior.
        */
        if (
          !roomsPromptsImmersiveXR(
            this.scene
          )
        ) {
          const canvas =
            this.scene &&
            this.scene.renderer
              ? this.scene
                  .renderer
                  .domElement
              : null;

          if (
            canvas
          ) {
            canvas.style.cursor =
              this.savedCanvasCursor ===
              null
                ? ''
                : this.savedCanvasCursor;
          }

          this.savedCanvasCursor =
            null;

          if (
            this.desktopCursor
          ) {
            this.desktopCursor
              .setAttribute(
                'visible',
                this
                  .desktopCursorWasVisible
              );
          }
        }

        roomsPromptState
          .pausedByInspection =
            false;
      },


    hideSettingsUIForInspection:
      function () {
        const vrButton =
          document.querySelector(
            '#vrPauseButton'
          );

        const vrPanel =
          document.querySelector(
            '#vrPausePanel'
          );

        const desktopButton =
          document.querySelector(
            '#screenPauseButton'
          );

        const desktopOverlay =
          document.querySelector(
            '#screenPauseMenuOverlay'
          );

        if (
          vrButton
        ) {
          vrButton.setAttribute(
            'visible',
            false
          );
        }

        if (
          vrPanel
        ) {
          vrPanel.setAttribute(
            'visible',
            false
          );
        }

        if (
          desktopButton
        ) {
          desktopButton
            .classList
            .remove(
              'is-visible'
            );
        }

        if (
          desktopOverlay
        ) {
          desktopOverlay
            .classList
            .remove(
              'is-open'
            );
        }
      },


    /* ========================================================
       INFO CONTENT / 3D PREVIEW
    ======================================================== */

    setInspectionText:
      function (item) {
        if (
          this.inspectTitle
        ) {
          this.inspectTitle
            .setAttribute(
              'value',
              item.title
            );
        }

        if (
          this.inspectDescription
        ) {
          this.inspectDescription
            .setAttribute(
              'value',
              item.description
            );
        }
      },


    clearInspectionPreview:
      function () {
        if (
          this.previewObject &&
          this.previewObject.parent
        ) {
          this.previewObject
            .parent
            .remove(
              this.previewObject
            );
        }

        this.previewObject =
          null;
      },


    setInspectionPreview:
      function (entity) {
        this.clearInspectionPreview();

        if (
          !entity ||
          !this.inspectPreviewHolder
        ) {
          return;
        }

        const source =
          entity.getObject3D(
            'mesh'
          );

        if (
          !source
        ) {
          return;
        }

        try {
          const clone =
            source.clone(
              true
            );

          clone.traverse(
            (node) => {
              if (
                node.isMesh
              ) {
                node.frustumCulled =
                  false;
              }
            }
          );

          clone.updateMatrixWorld(
            true
          );

          const box =
            new THREE.Box3()
              .setFromObject(
                clone
              );

          if (
            box.isEmpty()
          ) {
            return;
          }

          const center =
            box.getCenter(
              new THREE.Vector3()
            );

          const size =
            box.getSize(
              new THREE.Vector3()
            );

          clone.position.sub(
            center
          );

          const maxDimension =
            Math.max(
              size.x,
              size.y,
              size.z,
              0.001
            );

          const group =
            new THREE.Group();

          group.add(
            clone
          );

          group.scale
            .setScalar(
              0.285 /
              maxDimension
            );

          group.rotation.set(
            0,
            THREE.MathUtils
              .degToRad(
                18
              ),
            0
          );

          this
            .inspectPreviewHolder
            .object3D
            .add(
              group
            );

          this.previewObject =
            group;

        } catch (
          error
        ) {
          console.warn(
            'Item preview could not be cloned:',
            error
          );
        }
      },


    /* ========================================================
       QUEST PROGRESS
    ======================================================== */

    /*
      CHECKLIST STATE

      The checklist is now controlled by physical placement on
      #truocbantho instead of by opening an information panel.

      story.js calls window.setRoomsQuestItemChecked(key, true/false).
    */

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

        if (
          !key
        ) {
          return false;
        }

        const item =
          ROOMS_QUEST_ITEMS
            .find(
              (candidate) =>
                candidate.key ===
                key
            );

        if (
          !item
        ) {
          return false;
        }

        const shouldCheck =
          checked !== false;

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

          if (
            story
          ) {
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
            if (
              story
            ) {
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


    /*
      Backward-compatible helper.
      Existing code that still calls markQuestItemFound(item)
      will tick that checklist item.
    */

    markQuestItemFound:
      function (item) {
        return this
          .setQuestItemChecked(
            item,
            true
          );
      },


    updateQuestUI:
      function () {
        ROOMS_QUEST_ITEMS
          .forEach(
            (item) => {
              const row =
                this.questRows
                  .get(
                    item.key
                  );

              if (
                !row
              ) {
                return;
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

        /*
          Visible during item-info pause.
          Hidden during normal Settings pause.
        */
        const allowedPauseState =
          !window.roomsPaused ||
          roomsPromptState
            .inspectionOpen;

        roomsSetVisible(
          this.questRoot,
          allowedMode &&
          allowedPauseState
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
        if (
          roomsPromptState
            .inspectionOpen &&
          this.previewObject &&
          delta
        ) {
          this.previewObject
            .rotation.y +=
              delta *
              0.00018;
        }

        roomsHideLegacyIncenseTooltip();

        if (
          !delta
        ) {
          return;
        }

        this.actionScanElapsed +=
          delta;

        /*
          Around 15 prompt checks per second.
        */
        if (
          this.actionScanElapsed <
          65
        ) {
          return;
        }

        this.actionScanElapsed =
          0;

        this.updateActionPrompt();
      },


    /* ========================================================
       CLEANUP
    ======================================================== */

    remove:
      function () {
        if (
          this.rightHand
        ) {
          this.rightHand
            .removeEventListener(
              'triggerdown',
              this.onRightTrigger
            );
        }

        this.boundQuestEntities
          .forEach(
            (entity) => {
              entity
                .removeEventListener(
                  'click',
                  this.onQuestEntityClick,
                  true
                );

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

        document
          .removeEventListener(
            'mousedown',
            this.onDesktopMouseDown,
            true
          );

        document
          .removeEventListener(
            'auxclick',
            this.onAuxClick,
            true
          );

        document
          .removeEventListener(
            'keydown',
            this.onKeyDown
          );

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

        this.clearInspectionPreview();

        this.setActionPrompt(
          ''
        );

        if (
          roomsPromptState.system ===
          this
        ) {
          roomsPromptState.system =
            null;
        }
      }
  }
);


/* ============================================================
   GLOBAL HELPERS
============================================================ */

window.getRoomsQuestState =
  function () {
    return {
      /*
        inspected = information panels opened at least once.
        found / checked = physical items currently accepted by story.js
        as being placed on #truocbantho.
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
        roomsPromptState
          .inspectionOpen
    };
  };


window.setRoomsQuestItemChecked =
  function (
    key,
    checked = true
  ) {
    const system =
      roomsPromptState.system;

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


window.openRoomsItemInspection =
  function (
    entityOrSelector
  ) {
    const system =
      roomsPromptState.system;

    if (
      !system
    ) {
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

    system.openInspection(
      entity,
      item
    );

    return true;
  };


window.closeRoomsItemInspection =
  function () {
    const system =
      roomsPromptState.system;

    if (
      !system
    ) {
      return false;
    }

    system.closeInspection();

    return true;
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

    if (
      !scene
    ) {
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