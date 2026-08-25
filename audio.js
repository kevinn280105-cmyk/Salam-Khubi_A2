/* ============================================================
   audio.js — ROOMS WITHIN

   - Living room + bedroom: rain
   - Kitchen: fluorescent buzz
   - Toilet / hallway: quiet
   - TV static is local + HRTF spatial
   - Footsteps use real camera movement
   - Thunder plays once when a flicker event starts
   - Normal room changes crossfade volume; ambience does not restart
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsTVWorldPosition = null;
let roomsAudioUnlocked = false;
let roomsAudioContext = null;
let roomsLastThunderTime = -Infinity;

window.roomsMuted = roomsMuted;


/* ============================================================
   SOUND DEFINITIONS
============================================================ */

const ROOM_AMBIENCE_DEFINITIONS = [
  {
    id: 'rainSound',
    src: 'sounds/bedroom-rain.wav',
    baseVolume: 0.20,
    loop: true
  },

  {
    id: 'fluorescentSound',
    src: 'sounds/fluorescent-light.wav',
    baseVolume: 0.15,
    loop: true
  }
];


const TV_SOUND_DEFINITION = {
  id: 'tvStaticSound',

  src: 'sounds/tv-static.mp3',

  baseVolume: 0.12,

  fullVolumeDistance: 1.35,

  maxDistance: 5.5,

  loop: true
};


const THUNDER_SOUND_DEFINITION = {
  id: 'thunderSound',

  src: 'sounds/thunder.wav',

  /*
    Thunder volume.

    0.55 = noticeable,
    but not maximum volume.
  */
  baseVolume: 0.55,

  /*
    Prevent two lights flashing at
    exactly the same moment from
    stacking two thunder sounds.
  */
  cooldown: 250,

  loop: false
};


const ROOM_ENTITY_IDS = [
  'living',
  'kitchen',
  'bedroom',
  'toilet'
];


/* ============================================================
   GENERAL HELPERS
============================================================ */

function clamp01(value) {
  return Math.max(
    0,
    Math.min(
      1,
      Number(value) || 0
    )
  );
}


function smoothStep01(value) {
  const t =
    clamp01(value);

  return (
    t *
    t *
    (
      3 -
      2 * t
    )
  );
}


function getScene() {
  return document.querySelector(
    'a-scene'
  );
}


function getCameraEntity() {
  return (
    document.querySelector(
      '#cam'
    ) ||

    document.querySelector(
      '[camera]'
    )
  );
}


function getRigEntity() {
  return document.querySelector(
    '#rig'
  );
}


function isRoomsPauseMenuOpen() {
  if (
    window.roomsPaused ||
    window.roomsInputLocked
  ) {
    return true;
  }


  const desktopOverlay =
    document.querySelector(
      '#screenPauseMenuOverlay'
    );


  if (
    desktopOverlay &&
    desktopOverlay
      .classList
      .contains(
        'is-open'
      )
  ) {
    return true;
  }


  const vrPanel =
    document.querySelector(
      '#vrPausePanel'
    );


  if (
    vrPanel
  ) {
    const visible =
      vrPanel.getAttribute(
        'visible'
      );


    if (
      visible === true ||
      visible === 'true'
    ) {
      return true;
    }
  }


  return false;
}


function getScareFootstepVolume() {
  if (
    roomsMuted
  ) {
    return 0;
  }


  return (
    0.30 *
    roomsMasterVolume
  );
}


/* ============================================================
   WEB AUDIO / HRTF
============================================================ */

function ensureRoomsAudioContext() {
  if (
    roomsAudioContext
  ) {
    return roomsAudioContext;
  }


  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;


  if (
    !AudioContextClass
  ) {
    console.warn(
      'Web Audio API unavailable. Spatial audio is disabled.'
    );

    return null;
  }


  roomsAudioContext =
    new AudioContextClass();


  return roomsAudioContext;
}


async function resumeRoomsAudioContext() {
  const context =
    ensureRoomsAudioContext();


  if (
    !context
  ) {
    return false;
  }


  try {
    if (
      context.state ===
      'suspended'
    ) {
      await context.resume();
    }


    return true;
  }

  catch (error) {
    console.warn(
      'Could not resume Web Audio context:',
      error
    );


    return false;
  }
}


function setAudioParam(
  param,
  value,
  context
) {
  if (
    !param
  ) {
    return;
  }


  const numericValue =
    Number(value) || 0;


  if (
    param.setValueAtTime &&
    context
  ) {
    param.setValueAtTime(
      numericValue,
      context.currentTime
    );
  }

  else {
    param.value =
      numericValue;
  }
}


/* ============================================================
   HEAD / EAR DIRECTION
============================================================ */

function updateRoomsAudioListener() {
  if (
    !roomsAudioContext
  ) {
    return;
  }


  const camera =
    getCameraEntity();


  if (
    !camera
  ) {
    return;
  }


  const position =
    new THREE.Vector3();


  const quaternion =
    new THREE.Quaternion();


  camera.object3D
    .getWorldPosition(
      position
    );


  camera.object3D
    .getWorldQuaternion(
      quaternion
    );


  const forward =
    new THREE.Vector3(
      0,
      0,
      -1
    )
      .applyQuaternion(
        quaternion
      );


  const up =
    new THREE.Vector3(
      0,
      1,
      0
    )
      .applyQuaternion(
        quaternion
      );


  const listener =
    roomsAudioContext.listener;


  if (
    listener.positionX &&
    listener.forwardX &&
    listener.upX
  ) {
    setAudioParam(
      listener.positionX,
      position.x,
      roomsAudioContext
    );


    setAudioParam(
      listener.positionY,
      position.y,
      roomsAudioContext
    );


    setAudioParam(
      listener.positionZ,
      position.z,
      roomsAudioContext
    );


    setAudioParam(
      listener.forwardX,
      forward.x,
      roomsAudioContext
    );


    setAudioParam(
      listener.forwardY,
      forward.y,
      roomsAudioContext
    );


    setAudioParam(
      listener.forwardZ,
      forward.z,
      roomsAudioContext
    );


    setAudioParam(
      listener.upX,
      up.x,
      roomsAudioContext
    );


    setAudioParam(
      listener.upY,
      up.y,
      roomsAudioContext
    );


    setAudioParam(
      listener.upZ,
      up.z,
      roomsAudioContext
    );
  }

  else {
    if (
      listener.setPosition
    ) {
      listener.setPosition(
        position.x,
        position.y,
        position.z
      );
    }


    if (
      listener.setOrientation
    ) {
      listener.setOrientation(
        forward.x,
        forward.y,
        forward.z,

        up.x,
        up.y,
        up.z
      );
    }
  }
}


/* ============================================================
   POSITION SPATIAL SOUND
============================================================ */

function setTrackSpatialPosition(
  track,
  worldPosition
) {
  if (
    !track ||
    !track.pannerNode ||
    !worldPosition ||
    !roomsAudioContext
  ) {
    return;
  }


  const panner =
    track.pannerNode;


  if (
    panner.positionX &&
    panner.positionY &&
    panner.positionZ
  ) {
    setAudioParam(
      panner.positionX,
      worldPosition.x,
      roomsAudioContext
    );


    setAudioParam(
      panner.positionY,
      worldPosition.y,
      roomsAudioContext
    );


    setAudioParam(
      panner.positionZ,
      worldPosition.z,
      roomsAudioContext
    );
  }

  else if (
    panner.setPosition
  ) {
    panner.setPosition(
      worldPosition.x,
      worldPosition.y,
      worldPosition.z
    );
  }
}


/* ============================================================
   TV DISTANCE
============================================================ */

function getTVDistanceGain(
  distance
) {
  const d =
    Math.max(
      0,
      Number(distance) || 0
    );


  if (
    d <=
    TV_SOUND_DEFINITION
      .fullVolumeDistance
  ) {
    return 1;
  }


  if (
    d >=
    TV_SOUND_DEFINITION
      .maxDistance
  ) {
    return 0;
  }


  const normalized =
    (
      d -
      TV_SOUND_DEFINITION
        .fullVolumeDistance
    )

    /

    (
      TV_SOUND_DEFINITION
        .maxDistance -

      TV_SOUND_DEFINITION
        .fullVolumeDistance
    );


  return (
    1 -
    smoothStep01(
      normalized
    )
  );
}


/* ============================================================
   ROOM DETECTION HELPERS
============================================================ */

function getHorizontalDistanceToBox(
  position,
  box
) {
  if (
    !position ||
    !box
  ) {
    return Infinity;
  }


  const dx =
    position.x <
    box.min.x

      ? box.min.x -
        position.x

      : position.x >
        box.max.x

        ? position.x -
          box.max.x

        : 0;


  const dz =
    position.z <
    box.min.z

      ? box.min.z -
        position.z

      : position.z >
        box.max.z

        ? position.z -
          box.max.z

        : 0;


  return Math.sqrt(
    dx * dx +
    dz * dz
  );
}


function pointInsideHorizontalBox(
  position,
  box,
  padding
) {
  if (
    !position ||
    !box
  ) {
    return false;
  }


  const pad =
    Math.max(
      0,
      Number(
        padding
      ) || 0
    );


  return (
    position.x >=
      box.min.x -
      pad &&

    position.x <=
      box.max.x +
      pad &&

    position.z >=
      box.min.z -
      pad &&

    position.z <=
      box.max.z +
      pad
  );
}


/* ============================================================
   SPATIAL AUDIO MANAGER
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {
    schema: {
      roomPadding: {
        default: 0.32
      },


      roomDetectionDistance: {
        default: 1.6
      },


      roomHoldDuration: {
        default: 1800
      },


      crossfadeDuration: {
        default: 900
      },


      updateInterval: {
        default: 60
      }
    },


    init: function () {
      this.tracks =
        new Map();


      this.roomZones =
        new Map();


      this.created =
        false;


      this.currentRoom =
        null;


      this.lastRawRoom =
        null;


      this.lastValidRoom =
        null;


      this.lastValidRoomTime =
        0;


      this.lastUpdateTime =
        0;


      this.lastZoneRefresh =
        0;


      this.playerWorldPosition =
        new THREE.Vector3();


      this.fallbackTVPosition =
        new THREE.Vector3();


      this.hasFallbackTVPosition =
        false;


      this.thunderAudio =
        null;


      this.createTracks =
        this.createTracks
          .bind(
            this
          );


      this.onPauseChanged =
        this.onPauseChanged
          .bind(
            this
          );


      this.onRoomModelLoaded =
        this.onRoomModelLoaded
          .bind(
            this
          );


      this.el
        .addEventListener(
          'rooms-pause-changed',
          this.onPauseChanged
        );


      ROOM_ENTITY_IDS
        .forEach(
          (id) => {
            const entity =
              document.querySelector(
                `#${id}`
              );


            if (
              entity
            ) {
              entity.addEventListener(
                'model-loaded',
                this.onRoomModelLoaded
              );
            }
          }
        );


      if (
        this.el.hasLoaded
      ) {
        this.createTracks();
      }

      else {
        this.el.addEventListener(
          'loaded',
          this.createTracks,
          {
            once:
              true
          }
        );
      }


      window.setTimeout(
        () =>
          this.refreshRoomZones(),

        600
      );
    },


    /* ======================================================
       CREATE AUDIO ELEMENT
    ====================================================== */

    createAudioElement:
      function (
        id,
        src,
        loop
      ) {
        const audio =
          new Audio();


        audio.id =
          id;


        audio.src =
          src;


        audio.preload =
          'auto';


        audio.loop =
          Boolean(
            loop
          );


        audio.playsInline =
          true;


        audio.volume =
          0;


        audio.addEventListener(
          'error',
          () => {
            console.error(
              `Audio failed to load: ${src}`
            );
          }
        );


        audio.addEventListener(
          'canplaythrough',

          () =>
            console.log(
              `Audio ready: ${id}`
            ),

          {
            once:
              true
          }
        );


        document.body
          .appendChild(
            audio
          );


        return audio;
      },


    /* ======================================================
       CREATE SOUNDS
    ====================================================== */

    createTracks:
      function () {
        if (
          this.created
        ) {
          return;
        }


        this.created =
          true;


        ROOM_AMBIENCE_DEFINITIONS
          .forEach(
            (definition) => {
              const audio =
                this.createAudioElement(
                  definition.id,
                  definition.src,
                  definition.loop
                );


              this.tracks.set(
                definition.id,
                {
                  type:
                    'room',

                  definition,

                  audio,

                  sourceNode:
                    null,

                  pannerNode:
                    null,

                  currentGain:
                    0,

                  targetGain:
                    0,

                  lastDistance:
                    null,

                  lastGain:
                    0
                }
              );
            }
          );


        /* TV */

        const tvAudio =
          this.createAudioElement(
            TV_SOUND_DEFINITION.id,
            TV_SOUND_DEFINITION.src,
            TV_SOUND_DEFINITION.loop
          );


        this.tracks.set(
          TV_SOUND_DEFINITION.id,
          {
            type:
              'tv',

            definition:
              TV_SOUND_DEFINITION,

            audio:
              tvAudio,

            sourceNode:
              null,

            pannerNode:
              null,

            currentGain:
              0,

            targetGain:
              0,

            lastDistance:
              Infinity,

            lastGain:
              0
          }
        );


        /* THUNDER */

        this.thunderAudio =
          this.createAudioElement(
            THUNDER_SOUND_DEFINITION.id,
            THUNDER_SOUND_DEFINITION.src,
            false
          );


        this.refreshRoomZones();


        this.applyPlaybackState();
      },


    /* ======================================================
       HRTF
    ====================================================== */

    ensureSpatialGraphs:
      function () {
        const context =
          ensureRoomsAudioContext();


        if (
          !context
        ) {
          return;
        }


        this.tracks.forEach(
          (track) => {
            if (
              !track.audio ||
              track.sourceNode ||
              track.pannerNode
            ) {
              return;
            }


            try {
              const source =
                context
                  .createMediaElementSource(
                    track.audio
                  );


              const panner =
                context
                  .createPanner();


              panner.panningModel =
                'HRTF';


              panner.distanceModel =
                'inverse';


              panner.refDistance =
                1;


              panner.maxDistance =
                10000;


              panner.rolloffFactor =
                0;


              source.connect(
                panner
              );


              panner.connect(
                context.destination
              );


              track.sourceNode =
                source;


              track.pannerNode =
                panner;
            }

            catch (error) {
              console.warn(
                `Could not create spatial audio graph for ${track.audio.id}:`,
                error
              );
            }
          }
        );


        this.updateSpatialPositions();
      },


    getTrack:
      function (
        id
      ) {
        return (
          this.tracks.get(
            id
          ) ||
          null
        );
      },


    /* ======================================================
       PLAYER POSITION
    ====================================================== */

    getPlayerPosition:
      function () {
        const camera =
          getCameraEntity();


        if (
          !camera
        ) {
          return null;
        }


        camera.object3D
          .getWorldPosition(
            this.playerWorldPosition
          );


        return (
          this.playerWorldPosition
        );
      },


    onRoomModelLoaded:
      function () {
        this.refreshRoomZones();


        this.updateSpatialPositions();
      },


    /* ======================================================
       ROOM BOUNDS
    ====================================================== */

    refreshRoomZones:
      function () {
        ROOM_ENTITY_IDS
          .forEach(
            (id) => {
              const entity =
                document.querySelector(
                  `#${id}`
                );


              if (
                !entity
              ) {
                return;
              }


              const root =
                entity.getObject3D(
                  'mesh'
                );


              if (
                !root
              ) {
                return;
              }


              root.updateMatrixWorld(
                true
              );


              const box =
                new THREE.Box3()
                  .setFromObject(
                    root
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


              this.roomZones.set(
                id,
                {
                  id,

                  box,

                  center,

                  size,

                  area:
                    Math.max(
                      0.001,

                      size.x *
                      size.z
                    )
                }
              );
            }
          );


        const livingZone =
          this.roomZones.get(
            'living'
          );


        if (
          livingZone
        ) {
          this.fallbackTVPosition
            .copy(
              livingZone.center
            );


          this.hasFallbackTVPosition =
            true;
        }


        this.updateSpatialPositions();
      },


    /* ======================================================
       TV POSITION
    ====================================================== */

    resolveTVPosition:
      function () {
        if (
          roomsTVWorldPosition
        ) {
          return (
            roomsTVWorldPosition
          );
        }


        const glow =
          document.querySelector(
            '#tvGlowLight'
          );


        if (
          glow
        ) {
          const position =
            new THREE.Vector3();


          glow.object3D
            .getWorldPosition(
              position
            );


          if (
            position.lengthSq() >
            0.0001
          ) {
            return position;
          }
        }


        if (
          this.hasFallbackTVPosition
        ) {
          return (
            this.fallbackTVPosition
          );
        }


        return null;
      },


    /* ======================================================
       SPATIAL POSITIONS
    ====================================================== */

    updateSpatialPositions:
      function () {
        /*
          RAIN

          Same rain track is used in
          living room and bedroom.

          Move its spatial point to
          whichever room we're currently in.
        */

        const rainTrack =
          this.getTrack(
            'rainSound'
          );


        const bedroomZone =
          this.roomZones.get(
            'bedroom'
          );


        const livingZone =
          this.roomZones.get(
            'living'
          );


        if (
          rainTrack
        ) {
          const rainPosition =
            this.currentRoom ===
              'living' &&
            livingZone

              ? livingZone.center

              : bedroomZone

                ? bedroomZone.center

                : livingZone

                  ? livingZone.center

                  : null;


          if (
            rainPosition
          ) {
            setTrackSpatialPosition(
              rainTrack,
              rainPosition
            );
          }
        }


        /*
          KITCHEN
        */

        const fluorescentTrack =
          this.getTrack(
            'fluorescentSound'
          );


        const kitchenZone =
          this.roomZones.get(
            'kitchen'
          );


        if (
          fluorescentTrack &&
          kitchenZone
        ) {
          setTrackSpatialPosition(
            fluorescentTrack,
            kitchenZone.center
          );
        }


        /*
          TV
        */

        const tvTrack =
          this.getTrack(
            'tvStaticSound'
          );


        const tvPosition =
          this.resolveTVPosition();


        if (
          tvTrack &&
          tvPosition
        ) {
          setTrackSpatialPosition(
            tvTrack,
            tvPosition
          );
        }
      },


    /* ======================================================
       RAW ROOM DETECTION
    ====================================================== */

    detectRoomRaw:
      function (
        playerPosition
      ) {
        if (
          !playerPosition
        ) {
          return null;
        }


        const inside =
          [];


        this.roomZones
          .forEach(
            (zone) => {
              if (
                pointInsideHorizontalBox(
                  playerPosition,
                  zone.box,
                  this.data
                    .roomPadding
                )
              ) {
                inside.push(
                  zone
                );
              }
            }
          );


        if (
          inside.length >
          0
        ) {
          inside.sort(
            (
              a,
              b
            ) => {
              const distanceA =
                Math.hypot(
                  playerPosition.x -
                    a.center.x,

                  playerPosition.z -
                    a.center.z
                );


              const distanceB =
                Math.hypot(
                  playerPosition.x -
                    b.center.x,

                  playerPosition.z -
                    b.center.z
                );


              if (
                Math.abs(
                  distanceA -
                  distanceB
                ) >
                0.05
              ) {
                return (
                  distanceA -
                  distanceB
                );
              }


              return (
                a.area -
                b.area
              );
            }
          );


          return (
            inside[0].id
          );
        }


        let nearestRoom =
          null;


        let nearestDistance =
          Infinity;


        this.roomZones
          .forEach(
            (zone) => {
              const distance =
                getHorizontalDistanceToBox(
                  playerPosition,
                  zone.box
                );


              if (
                distance <
                nearestDistance
              ) {
                nearestDistance =
                  distance;


                nearestRoom =
                  zone.id;
              }
            }
          );


        if (
          nearestDistance <=
          this.data
            .roomDetectionDistance
        ) {
          return nearestRoom;
        }


        return null;
      },


    /* ======================================================
       STABLE ROOM DETECTION

       Prevents tiny gaps between rooms
       from suddenly killing the ambience.
    ====================================================== */

    detectStableRoom:
      function (
        playerPosition,
        time
      ) {
        const rawRoom =
          this.detectRoomRaw(
            playerPosition
          );


        this.lastRawRoom =
          rawRoom;


        if (
          rawRoom
        ) {
          this.lastValidRoom =
            rawRoom;


          this.lastValidRoomTime =
            time;


          return rawRoom;
        }


        if (
          this.lastValidRoom &&
          time -
            this.lastValidRoomTime <=
            this.data
              .roomHoldDuration
        ) {
          return (
            this.lastValidRoom
          );
        }


        return null;
      },


    /* ======================================================
       ROOM -> SOUND
    ====================================================== */

    getRoomTrackId:
      function (
        roomId
      ) {
        /*
          Living room + bedroom
          both use rain.
        */

        if (
          roomId ===
            'living' ||

          roomId ===
            'bedroom'
        ) {
          return 'rainSound';
        }


        /*
          Kitchen buzz.
        */

        if (
          roomId ===
          'kitchen'
        ) {
          return 'fluorescentSound';
        }


        /*
          Toilet / hallway = quiet.
        */

        return null;
      },


    /* ======================================================
       KEEP TRACK PLAYING
    ====================================================== */

    ensurePlaying:
      function (
        track
      ) {
        if (
          !track ||
          !track.audio ||
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen() ||
          !track.audio.paused
        ) {
          return;
        }


        const promise =
          track.audio.play();


        if (
          promise &&
          promise.catch
        ) {
          promise.catch(
            (error) => {
              console.warn(
                `Could not start ${track.audio.id}:`,
                error
              );
            }
          );
        }
      },


    ensureContinuousRoomTracks:
      function () {
        this.tracks.forEach(
          (track) => {
            if (
              track.type ===
              'room'
            ) {
              this.ensurePlaying(
                track
              );
            }
          }
        );
      },


    /* ======================================================
       CHANGE ROOM
    ====================================================== */

    setCurrentRoom:
      function (
        roomId
      ) {
        if (
          roomId ===
          this.currentRoom
        ) {
          return;
        }


        this.currentRoom =
          roomId;


        const activeTrackId =
          this.getRoomTrackId(
            roomId
          );


        this.tracks
          .forEach(
            (
              track,
              id
            ) => {
              if (
                track.type !==
                'room'
              ) {
                return;
              }


              track.targetGain =
                id ===
                activeTrackId

                  ? 1

                  : 0;
            }
          );


        this.updateSpatialPositions();


        this.el.emit(
          'rooms-audio-room-changed',

          {
            room:
              roomId,

            ambienceTrack:
              activeTrackId
          },

          false
        );


        console.log(
          'Audio room:',

          roomId ||
          'quiet / hallway'
        );
      },


    /* ======================================================
       CROSSFADE
    ====================================================== */

    updateRoomCrossfade:
      function (
        deltaTime
      ) {
        const fadeDuration =
          Math.max(
            100,

            this.data
              .crossfadeDuration
          );


        const step =
          Math.min(
            1,

            deltaTime /
            fadeDuration
          );


        this.tracks
          .forEach(
            (track) => {
              if (
                track.type !==
                'room'
              ) {
                return;
              }


              const difference =
                track.targetGain -
                track.currentGain;


              if (
                Math.abs(
                  difference
                ) <=
                step
              ) {
                track.currentGain =
                  track.targetGain;
              }

              else {
                track.currentGain +=
                  Math.sign(
                    difference
                  ) *
                  step;
              }


              const targetVolume =
                roomsMuted ||
                isRoomsPauseMenuOpen()

                  ? 0

                  : (
                      track.definition
                        .baseVolume *

                      roomsMasterVolume *

                      track.currentGain
                    );


              track.audio.volume =
                clamp01(
                  targetVolume
                );


              track.lastGain =
                track.currentGain;


              /*
                IMPORTANT:

                Don't pause ambience during
                normal room changes.

                It keeps running silently.
              */

              this.ensurePlaying(
                track
              );
            }
          );
      },


    /* ======================================================
       TV
    ====================================================== */

    updateTVVolume:
      function (
        playerPosition
      ) {
        const track =
          this.getTrack(
            'tvStaticSound'
          );


        if (
          !track ||
          !track.audio
        ) {
          return;
        }


        if (
          !roomsTVOn ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          track.currentGain =
            0;


          track.targetGain =
            0;


          track.lastGain =
            0;


          track.audio.volume =
            0;


          if (
            !roomsTVOn
          ) {
            track.audio.pause();


            track.audio.currentTime =
              0;
          }


          return;
        }


        this.ensurePlaying(
          track
        );


        const tvPosition =
          this.resolveTVPosition();


        let distance =
          0;


        let gain =
          1;


        if (
          playerPosition &&
          tvPosition
        ) {
          distance =
            playerPosition
              .distanceTo(
                tvPosition
              );


          gain =
            getTVDistanceGain(
              distance
            );


          setTrackSpatialPosition(
            track,
            tvPosition
          );
        }


        track.lastDistance =
          distance;


        track.lastGain =
          gain;


        track.currentGain =
          gain;


        track.targetGain =
          gain;


        track.audio.volume =
          clamp01(
            TV_SOUND_DEFINITION
              .baseVolume *

            roomsMasterVolume *

            gain
          );
      },


    /* ======================================================
       REAL PAUSE
    ====================================================== */

    pauseAllForRealPause:
      function () {
        this.tracks
          .forEach(
            (track) => {
              track.audio.pause();


              track.audio.volume =
                0;
            }
          );


        if (
          this.thunderAudio
        ) {
          this.thunderAudio.pause();
        }
      },


    /* ======================================================
       APPLY STATE
    ====================================================== */

    applyPlaybackState:
      function () {
        if (
          !this.created
        ) {
          return;
        }


        if (
          roomsAudioContext
        ) {
          updateRoomsAudioListener();


          this.ensureSpatialGraphs();
        }


        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          this.pauseAllForRealPause();


          return;
        }


        this.ensureContinuousRoomTracks();


        const playerPosition =
          this.getPlayerPosition();


        const detectedRoom =
          this.detectStableRoom(
            playerPosition,
            performance.now()
          );


        this.setCurrentRoom(
          detectedRoom
        );


        this.updateRoomCrossfade(
          this.data
            .updateInterval
        );


        this.updateTVVolume(
          playerPosition
        );
      },


    onPauseChanged:
      function () {
        this.applyPlaybackState();
      },


    /* ======================================================
       UPDATE
    ====================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          !deltaTime
        ) {
          return;
        }


        if (
          time -
          this.lastUpdateTime <
          this.data
            .updateInterval
        ) {
          return;
        }


        const elapsed =
          this.lastUpdateTime >
          0

            ? time -
              this.lastUpdateTime

            : this.data
                .updateInterval;


        this.lastUpdateTime =
          time;


        if (
          time -
          this.lastZoneRefresh >
          2500
        ) {
          this.lastZoneRefresh =
            time;


          this.refreshRoomZones();
        }


        if (
          roomsAudioContext
        ) {
          updateRoomsAudioListener();


          this.updateSpatialPositions();
        }


        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          return;
        }


        this.ensureContinuousRoomTracks();


        const playerPosition =
          this.getPlayerPosition();


        const detectedRoom =
          this.detectStableRoom(
            playerPosition,
            time
          );


        if (
          detectedRoom !==
          this.currentRoom
        ) {
          this.setCurrentRoom(
            detectedRoom
          );
        }


        this.updateRoomCrossfade(
          elapsed
        );


        this.updateTVVolume(
          playerPosition
        );
      },


    /* ======================================================
       CLEANUP
    ====================================================== */

    remove:
      function () {
        this.el
          .removeEventListener(
            'rooms-pause-changed',
            this.onPauseChanged
          );


        ROOM_ENTITY_IDS
          .forEach(
            (id) => {
              const entity =
                document.querySelector(
                  `#${id}`
                );


              if (
                entity
              ) {
                entity.removeEventListener(
                  'model-loaded',
                  this.onRoomModelLoaded
                );
              }
            }
          );


        this.tracks
          .forEach(
            (track) => {
              if (
                !track.audio
              ) {
                return;
              }


              track.audio.pause();


              try {
                if (
                  track.sourceNode
                ) {
                  track.sourceNode
                    .disconnect();
                }


                if (
                  track.pannerNode
                ) {
                  track.pannerNode
                    .disconnect();
                }
              }

              catch (error) {
                /*
                  Ignore cleanup errors.
                */
              }


              track.audio
                .removeAttribute(
                  'src'
                );


              track.audio.load();


              if (
                track.audio
                  .parentNode
              ) {
                track.audio
                  .parentNode
                  .removeChild(
                    track.audio
                  );
              }
            }
          );


        /*
          THUNDER CLEANUP
        */

        if (
          this.thunderAudio
        ) {
          this.thunderAudio.pause();


          this.thunderAudio
            .removeAttribute(
              'src'
            );


          this.thunderAudio.load();


          if (
            this.thunderAudio
              .parentNode
          ) {
            this.thunderAudio
              .parentNode
              .removeChild(
                this.thunderAudio
              );
          }


          this.thunderAudio =
            null;
        }


        this.tracks.clear();


        this.roomZones.clear();
      }
  }
);


/* ============================================================
   GET MANAGER
============================================================ */

function getSpatialAudioManager() {
  const scene =
    getScene();


  if (
    !scene
  ) {
    return null;
  }


  return (
    scene.components[
      'spatial-audio-manager'
    ] ||
    null
  );
}


/* ============================================================
   UNLOCK AUDIO
============================================================ */

function unlockAudioElement(
  audio
) {
  if (
    !audio
  ) {
    return Promise.resolve(
      false
    );
  }


  const previousVolume =
    audio.volume;


  audio.volume =
    0;


  try {
    const promise =
      audio.play();


    if (
      promise &&
      promise.then
    ) {
      return promise

        .then(
          () => {
            audio.pause();


            audio.currentTime =
              0;


            audio.volume =
              previousVolume;


            return true;
          }
        )

        .catch(
          () => {
            audio.pause();


            audio.currentTime =
              0;


            audio.volume =
              previousVolume;


            return false;
          }
        );
    }


    audio.pause();


    audio.currentTime =
      0;


    audio.volume =
      previousVolume;


    return Promise.resolve(
      true
    );
  }

  catch (error) {
    audio.pause();


    audio.currentTime =
      0;


    audio.volume =
      previousVolume;


    return Promise.resolve(
      false
    );
  }
}


/* ============================================================
   THUNDER

   engine-environment.js calls:

   window.playRoomsThunder()
============================================================ */

function playRoomsThunder() {
  const manager =
    getSpatialAudioManager();


  if (
    !manager ||
    !manager.thunderAudio ||
    !roomsAudioUnlocked ||
    roomsMuted ||
    isRoomsPauseMenuOpen()
  ) {
    return false;
  }


  const now =
    performance.now();


  /*
    If two different lights flicker
    together, don't stack two thunder
    WAV files on top of each other.
  */

  if (
    now -
    roomsLastThunderTime <
    THUNDER_SOUND_DEFINITION
      .cooldown
  ) {
    return false;
  }


  roomsLastThunderTime =
    now;


  const thunder =
    manager.thunderAudio;


  thunder.pause();


  thunder.currentTime =
    0;


  thunder.volume =
    clamp01(
      THUNDER_SOUND_DEFINITION
        .baseVolume *

      roomsMasterVolume
    );


  const promise =
    thunder.play();


  if (
    promise &&
    promise.catch
  ) {
    promise.catch(
      (error) => {
        console.warn(
          'Thunder sound could not start:',
          error
        );
      }
    );
  }


  return true;
}


/* ============================================================
   FOOTSTEPS
============================================================ */

AFRAME.registerComponent(
  'footstep-player',
  {
    schema: {
      minSpeed: {
        default: 0.045
      },


      maxSpeed: {
        default: 3.8
      },


      stepDistance: {
        default: 0.42
      },


      teleportDistance: {
        default: 0.72
      },


      volume: {
        default: 0.27
      },


      minInterval: {
        default: 260
      }
    },


    init: function () {
      this.sourceAudio =
        document.querySelector(
          '#footstepAudio'
        );


      this.audioPool =
        [];


      this.poolIndex =
        0;


      this.previousWorldPosition =
        new THREE.Vector3();


      this.currentWorldPosition =
        new THREE.Vector3();


      this.hasPreviousPosition =
        false;


      this.accumulatedDistance =
        0;


      this.lastStepTime =
        -Infinity;


      this.lastSpeed =
        0;


      this.lastDeltaDistance =
        0;


      this.createAudioPool();
    },


    createAudioPool:
      function () {
        if (
          !this.sourceAudio
        ) {
          console.warn(
            'Footstep audio element #footstepAudio was not found.'
          );


          return;
        }


        this.sourceAudio.pause();


        this.sourceAudio.loop =
          false;


        this.sourceAudio.volume =
          0;


        for (
          let i = 0;
          i < 2;
          i++
        ) {
          const audio =
            new Audio();


          audio.src =
            this.sourceAudio
              .currentSrc ||

            this.sourceAudio
              .src;


          audio.preload =
            'auto';


          audio.loop =
            false;


          audio.playsInline =
            true;


          audio.volume =
            0;


          document.body
            .appendChild(
              audio
            );


          this.audioPool.push(
            audio
          );
        }
      },


    getAudioElements:
      function () {
        return (
          this.audioPool.slice()
        );
      },


    getMovementEntity:
      function () {
        return (
          getCameraEntity() ||
          this.el
        );
      },


    resetTracking:
      function () {
        this.hasPreviousPosition =
          false;


        this.accumulatedDistance =
          0;


        this.lastSpeed =
          0;


        this.lastDeltaDistance =
          0;
      },


    stopAllSteps:
      function () {
        this.audioPool
          .forEach(
            (audio) => {
              audio.pause();


              audio.currentTime =
                0;
            }
          );
      },


    playStep:
      function (
        time,
        speed
      ) {
        if (
          this.audioPool.length ===
            0 ||

          !roomsAudioUnlocked ||

          roomsMuted ||

          isRoomsPauseMenuOpen()
        ) {
          return;
        }


        if (
          time -
          this.lastStepTime <
          this.data
            .minInterval
        ) {
          return;
        }


        const audio =
          this.audioPool[
            this.poolIndex
          ];


        this.poolIndex =
          (
            this.poolIndex +
            1
          )

          %

          this.audioPool
            .length;


        audio.pause();


        audio.currentTime =
          0;


        const speedGain =
          THREE.MathUtils
            .clamp(
              speed / 1.2,
              0.65,
              1
            );


        audio.volume =
          clamp01(
            this.data.volume *

            roomsMasterVolume *

            speedGain
          );


        audio.playbackRate =
          0.96 +
          Math.random() *
          0.08;


        const promise =
          audio.play();


        if (
          promise &&
          promise.catch
        ) {
          promise.catch(
            (error) => {
              console.warn(
                'Footstep sound could not start:',
                error
              );
            }
          );
        }


        this.lastStepTime =
          time;
      },


    pause:
      function () {
        this.stopAllSteps();


        this.resetTracking();
      },


    play:
      function () {
        this.resetTracking();
      },


    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          !deltaTime ||
          this.audioPool.length ===
            0
        ) {
          return;
        }


        if (
          roomsMuted ||
          isRoomsPauseMenuOpen() ||
          !roomsAudioUnlocked
        ) {
          this.stopAllSteps();


          this.resetTracking();


          return;
        }


        const movementEntity =
          this.getMovementEntity();


        if (
          !movementEntity
        ) {
          return;
        }


        movementEntity.object3D
          .getWorldPosition(
            this.currentWorldPosition
          );


        if (
          !this.hasPreviousPosition
        ) {
          this.previousWorldPosition
            .copy(
              this.currentWorldPosition
            );


          this.hasPreviousPosition =
            true;


          return;
        }


        const deltaX =
          this.currentWorldPosition.x -
          this.previousWorldPosition.x;


        const deltaZ =
          this.currentWorldPosition.z -
          this.previousWorldPosition.z;


        const distance =
          Math.sqrt(
            deltaX * deltaX +
            deltaZ * deltaZ
          );


        const speed =
          distance

          /

          Math.max(
            deltaTime /
              1000,

            0.001
          );


        this.lastSpeed =
          speed;


        this.lastDeltaDistance =
          distance;


        /*
          Teleport should not produce
          footsteps.
        */

        if (
          distance >=
          this.data
            .teleportDistance
        ) {
          this.accumulatedDistance =
            0;


          this.previousWorldPosition
            .copy(
              this.currentWorldPosition
            );


          return;
        }


        const effectiveMinSpeed =
          Math.max(
            0.045,

            this.data
              .minSpeed
          );


        const isWalking =
          speed >=
            effectiveMinSpeed &&

          speed <=
            this.data.maxSpeed;


        if (
          isWalking
        ) {
          this.accumulatedDistance +=
            distance;


          if (
            this.accumulatedDistance >=
            this.data
              .stepDistance
          ) {
            this.playStep(
              time,
              speed
            );


            this.accumulatedDistance =
              Math.max(
                0,

                this.accumulatedDistance -

                this.data
                  .stepDistance
              );
          }
        }

        else if (
          speed <
          effectiveMinSpeed
        ) {
          this.accumulatedDistance =
            Math.max(
              0,

              this.accumulatedDistance -
              0.012
            );
        }


        this.previousWorldPosition
          .copy(
            this.currentWorldPosition
          );
      },


    remove:
      function () {
        this.stopAllSteps();


        this.audioPool
          .forEach(
            (audio) => {
              audio.removeAttribute(
                'src'
              );


              audio.load();


              if (
                audio.parentNode
              ) {
                audio.parentNode
                  .removeChild(
                    audio
                  );
              }
            }
          );


        this.audioPool =
          [];
      }
  }
);


/* ============================================================
   ENABLE SOUND
============================================================ */

async function enableSound() {
  const scene =
    getScene();


  const button =
    document.querySelector(
      '#soundButton'
    );


  if (
    !scene
  ) {
    console.error(
      'Cannot enable sound: a-scene was not found.'
    );


    return;
  }


  if (
    button
  ) {
    button.textContent =
      'STARTING SOUND...';


    button.disabled =
      true;
  }


  const manager =
    getSpatialAudioManager();


  if (
    !manager
  ) {
    console.error(
      'Cannot enable sound: spatial-audio-manager is not ready.'
    );


    if (
      button
    ) {
      button.textContent =
        'TRY SOUND AGAIN';


      button.disabled =
        false;
    }


    return;
  }


  if (
    !manager.created
  ) {
    manager.createTracks();
  }


  await resumeRoomsAudioContext();


  manager.ensureSpatialGraphs();


  updateRoomsAudioListener();


  const unlockPromises =
    [];


  /* Room sounds + TV */

  manager.tracks
    .forEach(
      (track) => {
        if (
          track.audio
        ) {
          unlockPromises.push(
            unlockAudioElement(
              track.audio
            )
          );
        }
      }
    );


  /* THUNDER */

  if (
    manager.thunderAudio
  ) {
    unlockPromises.push(
      unlockAudioElement(
        manager.thunderAudio
      )
    );
  }


  /* FOOTSTEPS */

  const rig =
    getRigEntity();


  const footstepComponent =
    rig &&
    rig.components

      ? rig.components[
          'footstep-player'
        ]

      : null;


  if (
    footstepComponent &&
    footstepComponent
      .getAudioElements
  ) {
    footstepComponent
      .getAudioElements()
      .forEach(
        (audio) => {
          unlockPromises.push(
            unlockAudioElement(
              audio
            )
          );
        }
      );
  }

  else {
    const fallbackFootstep =
      document.querySelector(
        '#footstepAudio'
      );


    if (
      fallbackFootstep
    ) {
      unlockPromises.push(
        unlockAudioElement(
          fallbackFootstep
        )
      );
    }
  }


  /* SCARE */

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );


  if (
    scareFootstep
  ) {
    unlockPromises.push(
      unlockAudioElement(
        scareFootstep
      )
    );
  }


  const results =
    await Promise.allSettled(
      unlockPromises
    );


  const successCount =
    results.filter(
      (result) =>
        result.status ===
          'fulfilled' &&

        result.value ===
          true
    ).length;


  roomsAudioUnlocked =
    true;


  scene.audioUnlocked =
    true;


  if (
    scareFootstep
  ) {
    scareFootstep.volume =
      getScareFootstepVolume();
  }


  manager.refreshRoomZones();


  manager.updateSpatialPositions();


  manager.ensureContinuousRoomTracks();


  manager.applyPlaybackState();


  updateRoomsVolumeUI();


  scene.emit(
    'audio-settings-changed',

    getRoomsAudioState(),

    false
  );


  if (
    button
  ) {
    button.textContent =
      'SOUND ENABLED';


    window.setTimeout(
      () => {
        button.style.display =
          'none';
      },

      900
    );
  }


  console.log(
    `Rooms Within audio enabled. ${successCount} audio element(s) unlocked.`
  );
}


/* ============================================================
   TV
============================================================ */

function setRoomsTVState(
  shouldBeOn
) {
  roomsTVOn =
    Boolean(
      shouldBeOn
    );


  const manager =
    getSpatialAudioManager();


  if (
    !manager
  ) {
    return;
  }


  const tvTrack =
    manager.getTrack(
      'tvStaticSound'
    );


  if (
    roomsTVOn &&
    tvTrack
  ) {
    manager.ensurePlaying(
      tvTrack
    );
  }


  manager.applyPlaybackState();
}


function setRoomsTVPosition(
  worldPosition
) {
  if (
    !worldPosition
  ) {
    return;
  }


  roomsTVWorldPosition =
    new THREE.Vector3(
      Number(
        worldPosition.x
      ) || 0,

      Number(
        worldPosition.y
      ) || 0,

      Number(
        worldPosition.z
      ) || 0
    );


  const manager =
    getSpatialAudioManager();


  if (
    manager
  ) {
    manager.updateSpatialPositions();


    manager.applyPlaybackState();
  }


  console.log(
    'TV static sound position:',

    roomsTVWorldPosition
      .toArray()
      .map(
        (value) =>
          value.toFixed(
            2
          )
      )
  );
}


/* ============================================================
   VOLUME / MUTE
============================================================ */

function changeRoomsVolume(
  amount
) {
  roomsMasterVolume =
    clamp01(
      roomsMasterVolume +

      Number(
        amount || 0
      )
    );


  applyRoomsAudioSettings();
}


function toggleRoomsMute() {
  roomsMuted =
    !roomsMuted;


  window.roomsMuted =
    roomsMuted;


  applyRoomsAudioSettings();


  return roomsMuted;
}


/* ============================================================
   STATE
============================================================ */

function getRoomsAudioState() {
  const manager =
    getSpatialAudioManager();


  return {
    muted:
      roomsMuted,

    volume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    unlocked:
      roomsAudioUnlocked,

    room:
      manager

        ? manager.currentRoom

        : null,

    spatialAudio:
      Boolean(
        roomsAudioContext
      )
  };
}


/* ============================================================
   APPLY AUDIO SETTINGS
============================================================ */

function applyRoomsAudioSettings() {
  const manager =
    getSpatialAudioManager();


  if (
    manager
  ) {
    manager.applyPlaybackState();


    /*
      THUNDER also follows
      the master volume.
    */

    if (
      manager.thunderAudio
    ) {
      manager.thunderAudio.volume =
        clamp01(
          THUNDER_SOUND_DEFINITION
            .baseVolume *

          roomsMasterVolume
        );


      if (
        roomsMuted ||
        isRoomsPauseMenuOpen()
      ) {
        manager.thunderAudio.pause();
      }
    }
  }


  const rig =
    getRigEntity();


  const footsteps =
    rig &&
    rig.components

      ? rig.components[
          'footstep-player'
        ]

      : null;


  if (
    footsteps &&
    (
      roomsMuted ||
      isRoomsPauseMenuOpen()
    )
  ) {
    footsteps.stopAllSteps();


    footsteps.resetTracking();
  }


  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );


  if (
    scareFootstep
  ) {
    scareFootstep.volume =
      getScareFootstepVolume();


    if (
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      scareFootstep.pause();
    }
  }


  updateRoomsVolumeUI();


  const scene =
    getScene();


  if (
    scene
  ) {
    scene.emit(
      'audio-settings-changed',

      getRoomsAudioState(),

      false
    );
  }
}


/* ============================================================
   SOUND UI
============================================================ */

function updateRoomsVolumeUI() {
  const percent =
    Math.round(
      roomsMasterVolume *
      100
    );


  const screenVolumeLabel =
    document.querySelector(
      '#screenVolumeLabel'
    );


  if (
    screenVolumeLabel
  ) {
    screenVolumeLabel.textContent =
      `${percent}%`;
  }


  const vrVolumeLabel =
    document.querySelector(
      '#vrVolumeLabel'
    );


  if (
    vrVolumeLabel
  ) {
    vrVolumeLabel.setAttribute(
      'value',
      `${percent}%`
    );
  }


  const soundText =
    roomsMuted

      ? 'SOUND: OFF'

      : 'SOUND: ON';


  const screenSoundButton =
    document.querySelector(
      '#screenSoundButton'
    );


  if (
    screenSoundButton
  ) {
    screenSoundButton.textContent =
      soundText;
  }


  const vrSoundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );


  if (
    vrSoundLabel
  ) {
    vrSoundLabel.setAttribute(
      'value',
      soundText
    );
  }
}


/* ============================================================
   DEBUG

   Console:

   getRoomsAudioDebug()
============================================================ */

function getRoomsAudioDebug() {
  const manager =
    getSpatialAudioManager();


  const tracks =
    [];


  if (
    manager
  ) {
    manager.tracks
      .forEach(
        (
          track,
          id
        ) => {
          tracks.push(
            {
              id,

              type:
                track.type,

              src:
                track.definition.src,

              paused:
                track.audio.paused,

              currentTime:
                Number(
                  track.audio
                    .currentTime
                    .toFixed(
                      2
                    )
                ),

              volume:
                Number(
                  track.audio
                    .volume
                    .toFixed(
                      3
                    )
                ),

              gain:
                Number(
                  (
                    track.lastGain ||
                    0
                  )
                    .toFixed(
                      3
                    )
                ),

              spatial:
                Boolean(
                  track.pannerNode
                ),

              distance:
                Number.isFinite(
                  track.lastDistance
                )

                  ? Number(
                      track.lastDistance
                        .toFixed(
                          2
                        )
                    )

                  : null
            }
          );
        }
      );
  }


  const tvPosition =
    manager

      ? manager
          .resolveTVPosition()

      : roomsTVWorldPosition;


  return {
    unlocked:
      roomsAudioUnlocked,

    muted:
      roomsMuted,

    masterVolume:
      roomsMasterVolume,

    currentRoom:
      manager

        ? manager.currentRoom

        : null,

    rawDetectedRoom:
      manager

        ? manager.lastRawRoom

        : null,

    lastValidRoom:
      manager

        ? manager.lastValidRoom

        : null,

    tvOn:
      roomsTVOn,

    tvPosition:
      tvPosition

        ? tvPosition
            .toArray()
            .map(
              (value) =>
                Number(
                  value.toFixed(
                    2
                  )
                )
            )

        : null,

    thunder:
      manager &&
      manager.thunderAudio

        ? {
            src:
              THUNDER_SOUND_DEFINITION
                .src,

            paused:
              manager
                .thunderAudio
                .paused,

            volume:
              Number(
                manager
                  .thunderAudio
                  .volume
                  .toFixed(
                    3
                  )
              ),

            currentTime:
              Number(
                manager
                  .thunderAudio
                  .currentTime
                  .toFixed(
                    2
                  )
              )
          }

        : null,

    audioContextState:
      roomsAudioContext

        ? roomsAudioContext
            .state

        : null,

    spatialAudio:
      Boolean(
        roomsAudioContext
      ),

    paused:
      isRoomsPauseMenuOpen(),

    tracks
  };
}


function printRoomsAudioDebug() {
  const debug =
    getRoomsAudioDebug();


  console.log(
    'ROOMS WITHIN AUDIO DEBUG',
    debug
  );


  return debug;
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

window.enableSound =
  enableSound;


window.setRoomsTVState =
  setRoomsTVState;


window.setRoomsTVPosition =
  setRoomsTVPosition;


window.changeRoomsVolume =
  changeRoomsVolume;


window.toggleRoomsMute =
  toggleRoomsMute;


window.getRoomsAudioState =
  getRoomsAudioState;


window.applyRoomsAudioSettings =
  applyRoomsAudioSettings;


window.updateRoomsVolumeUI =
  updateRoomsVolumeUI;


/*
  This is what the new
  engine-environment.js flicker uses.
*/

window.playRoomsThunder =
  playRoomsThunder;


window.getRoomsAudioDebug =
  getRoomsAudioDebug;


window.printRoomsAudioDebug =
  printRoomsAudioDebug;