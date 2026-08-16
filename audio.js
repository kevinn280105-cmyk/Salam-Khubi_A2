/* ============================================================
   audio.js
   ROOMS WITHIN

   Handles:
   - Positional room ambience
   - Fan sound
   - Rain
   - Fluorescent light ambience
   - Interactive TV static
   - Player footsteps
   - Master volume
   - Mute / unmute

   IMPORTANT:

   TV static begins OFF.

   engine-interactions.js calls:

       window.setRoomsTVState(true)

   or:

       window.setRoomsTVState(false)

============================================================ */


/* ============================================================
   MASTER AUDIO STATE
============================================================ */

let roomsMasterVolume =
  1.0;


let roomsMuted =
  false;


/*
  TV always begins OFF.
*/
let roomsTVOn =
  false;


/* ============================================================
   POSITIONAL ROOM SOUND DEFINITIONS

   The positions are the locations from which
   each sound appears to originate.

   These can be adjusted later after testing
   the room in VR.
============================================================ */

const ROOM_SOUND_DEFINITIONS = [

  /* ----------------------------------------------------------
     CEILING FAN
  ---------------------------------------------------------- */

  {
    id:
      'fanSound',

    src:
      'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',

    position:
      '-3.5 2.4 -1',

    baseVolume:
      0.075,

    refDistance:
      1.4,

    rolloffFactor:
      1.8,

    maxDistance:
      9,

    startAutomatically:
      true
  },


  /* ----------------------------------------------------------
     BEDROOM / WINDOW RAIN
  ---------------------------------------------------------- */

  {
    id:
      'rainSound',

    src:
      'sounds/bedroom-rain.wav',

    position:
      '-2 1.6 -3',

    baseVolume:
      0.060,

    refDistance:
      1.7,

    rolloffFactor:
      1.4,

    maxDistance:
      10,

    startAutomatically:
      true
  },


  /* ----------------------------------------------------------
     FLUORESCENT LIGHT
  ---------------------------------------------------------- */

  {
    id:
      'fluorescentSound',

    src:
      'sounds/fluorescent-light.wav',

    position:
      '2.5 2.5 1.5',

    baseVolume:
      0.045,

    refDistance:
      1.2,

    rolloffFactor:
      1.8,

    maxDistance:
      8,

    startAutomatically:
      true
  },


  /* ----------------------------------------------------------
     TV STATIC

     IMPORTANT:

     startAutomatically is FALSE.

     It only plays when the TV is actually ON.
  ---------------------------------------------------------- */

  {
    id:
      'tvStaticSound',

    src:
      'sounds/tv-static.mp3',

    position:
      '2.2 1.15 -1.8',

    baseVolume:
      0.025,

    refDistance:
      1.0,

    rolloffFactor:
      2.25,

    maxDistance:
      7,

    startAutomatically:
      false
  }

];


/* ============================================================
   HELPER:
   FIND SOUND DEFINITION
============================================================ */

function getRoomSoundDefinition(
  id
) {

  return (
    ROOM_SOUND_DEFINITIONS.find(
      (definition) =>
        definition.id === id
    ) || null
  );
}


/* ============================================================
   HELPER:
   CALCULATE FINAL VOLUME
============================================================ */

function getFinalVolume(
  baseVolume
) {

  if (roomsMuted) {
    return 0;
  }


  return (
    baseVolume *
    roomsMasterVolume
  );
}


/* ============================================================
   SPATIAL AUDIO MANAGER

   Used on <a-scene>:

       spatial-audio-manager

============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {

    init:
      function () {

        this.emitters =
          [];


        this.createEmitters();
      },


    /* ======================================================
       CREATE POSITIONAL SOUND ENTITIES
    ====================================================== */

    createEmitters:
      function () {

        ROOM_SOUND_DEFINITIONS.forEach(
          (definition) => {

            /*
              Don't accidentally create
              the same emitter twice.
            */
            let entity =
              document.getElementById(
                definition.id
              );


            if (!entity) {

              entity =
                document.createElement(
                  'a-entity'
                );


              entity.setAttribute(
                'id',
                definition.id
              );


              entity.setAttribute(
                'position',
                definition.position
              );


              /*
                A-Frame positional sound.

                positional: true means the
                volume changes based on the
                player's distance.
              */
              entity.setAttribute(
                'sound',
                {

                  src:
                    `url(${definition.src})`,

                  autoplay:
                    false,

                  loop:
                    true,

                  positional:
                    true,

                  distanceModel:
                    'inverse',

                  refDistance:
                    definition.refDistance,

                  rolloffFactor:
                    definition.rolloffFactor,

                  maxDistance:
                    definition.maxDistance,

                  volume:
                    getFinalVolume(
                      definition.baseVolume
                    )
                }
              );


              this.el.appendChild(
                entity
              );
            }


            this.emitters.push(
              entity
            );
          }
        );


        console.log(
          'Spatial room audio emitters created.'
        );
      },


    /* ======================================================
       START ONE SOUND
    ====================================================== */

    startEmitter:
      function (
        entity
      ) {

        if (!entity) {
          return;
        }


        const definition =
          getRoomSoundDefinition(
            entity.id
          );


        if (!definition) {
          return;
        }


        /*
          Make sure its current volume matches
          master volume / mute settings.
        */
        entity.setAttribute(
          'sound',
          'volume',
          getFinalVolume(
            definition.baseVolume
          )
        );


        const sound =
          entity.components.sound;


        if (!sound) {
          return;
        }


        try {

          sound.playSound();

        } catch (error) {

          /*
            If the sound file is still loading,
            start it as soon as A-Frame reports
            that it is ready.
          */
          entity.addEventListener(
            'sound-loaded',

            () => {

              try {

                entity.components
                  .sound
                  .playSound();

              } catch (
                loadError
              ) {

                console.error(
                  'Could not play sound:',
                  entity.id,
                  loadError
                );
              }
            },

            {
              once: true
            }
          );
        }
      },


    /* ======================================================
       STOP ONE SOUND
    ====================================================== */

    stopEmitter:
      function (
        entity
      ) {

        if (
          !entity ||
          !entity.components ||
          !entity.components.sound
        ) {
          return;
        }


        try {

          entity.components
            .sound
            .stopSound();

        } catch (error) {

          console.error(
            'Could not stop sound:',
            entity.id,
            error
          );
        }
      },


    /* ======================================================
       START AUTOMATIC AMBIENCE

       Fan        = yes
       Rain       = yes
       Fluorescent= yes
       TV         = NO
    ====================================================== */

    playAll:
      function () {

        this.emitters.forEach(
          (entity) => {

            const definition =
              getRoomSoundDefinition(
                entity.id
              );


            if (!definition) {
              return;
            }


            /*
              TV static has:

              startAutomatically: false

              so it is skipped here.
            */
            if (
              definition
                .startAutomatically ===
                false
            ) {
              return;
            }


            this.startEmitter(
              entity
            );
          }
        );


        console.log(
          'Automatic room ambience started.'
        );
      },


    /* ======================================================
       STOP ALL SOUNDS
    ====================================================== */

    stopAll:
      function () {

        this.emitters.forEach(
          (entity) => {

            this.stopEmitter(
              entity
            );
          }
        );
      },


    /* ======================================================
       REFRESH ALL VOLUMES
    ====================================================== */

    updateVolumes:
      function () {

        this.emitters.forEach(
          (entity) => {

            const definition =
              getRoomSoundDefinition(
                entity.id
              );


            if (!definition) {
              return;
            }


            entity.setAttribute(
              'sound',
              'volume',
              getFinalVolume(
                definition.baseVolume
              )
            );
          }
        );
      }
  }
);


/* ============================================================
   ENABLE SOUND

   Browsers require the user to interact with
   the page before audio can start.

   Called by:

       onclick="enableSound()"

============================================================ */

function enableSound() {

  const scene =
    document.querySelector(
      'a-scene'
    );


  if (!scene) {
    return;
  }


  /*
    Resume Web Audio context if browser
    suspended it.
  */
  if (
    AFRAME.audioContext &&
    AFRAME.audioContext.state ===
      'suspended'
  ) {

    AFRAME.audioContext
      .resume()
      .catch(
        (error) => {

          console.error(
            'Could not resume audio context:',
            error
          );
        }
      );
  }


  scene.audioUnlocked =
    true;


  const manager =
    scene.components[
      'spatial-audio-manager'
    ];


  if (manager) {

    /*
      Start fan/rain/fluorescent.

      TV is deliberately skipped.
    */
    manager.playAll();
  }


  /*
    If someone switched the TV ON before
    pressing ENABLE SOUND, start the
    static now.
  */
  setRoomsTVState(
    roomsTVOn
  );


  /* ----------------------------------------------------------
     FOOTSTEP AUDIO

     Make sure browser permits this HTML
     audio element later.
  ---------------------------------------------------------- */

  const footstepAudio =
    document.getElementById(
      'footstepAudio'
    );


  if (footstepAudio) {

    footstepAudio.volume =
      getFinalVolume(
        0.18
      );


    /*
      Brief play/pause unlocks the element
      on browsers that require interaction.
    */
    const promise =
      footstepAudio.play();


    if (
      promise &&
      typeof promise.then ===
        'function'
    ) {

      promise
        .then(
          () => {

            footstepAudio.pause();

            footstepAudio.currentTime =
              0;
          }
        )
        .catch(
          () => {

            /*
              Not fatal.

              The footstep component will
              try again when movement begins.
            */
          }
        );
    }
  }


  /* ----------------------------------------------------------
     SCARE FOOTSTEP AUDIO
  ---------------------------------------------------------- */

  const scareAudio =
    document.getElementById(
      'scareFootstepAudio'
    );


  if (scareAudio) {

    scareAudio.volume =
      getFinalVolume(
        0.18
      );
  }


  /* ----------------------------------------------------------
     BUTTON FEEDBACK
  ---------------------------------------------------------- */

  const button =
    document.getElementById(
      'soundButton'
    );


  if (button) {

    button.textContent =
      'SOUND ENABLED';


    button.disabled =
      true;


    /*
      Hide after a short moment.
    */
    window.setTimeout(
      () => {

        button.style.display =
          'none';

      },

      800
    );
  }


  updateRoomsVolumeUI();


  console.log(
    'Rooms Within audio enabled.'
  );
}


/* ============================================================
   TV AUDIO STATE

   Called from engine-interactions.js:

       setRoomsTVState(true)
       setRoomsTVState(false)

============================================================ */

function setRoomsTVState(
  shouldBeOn
) {

  roomsTVOn =
    Boolean(
      shouldBeOn
    );


  const scene =
    document.querySelector(
      'a-scene'
    );


  /*
    Remember the state even when audio
    hasn't been unlocked yet.
  */
  if (!scene) {
    return;
  }


  const tvSoundEntity =
    document.getElementById(
      'tvStaticSound'
    );


  /*
    Sound entity might not be ready during
    very early page loading.

    That's okay. roomsTVOn remembers state.
  */
  if (!tvSoundEntity) {
    return;
  }


  /*
    Browser has not yet received an
    ENABLE SOUND interaction.

    Don't attempt playback yet.
  */
  if (
    !scene.audioUnlocked
  ) {
    return;
  }


  const manager =
    scene.components[
      'spatial-audio-manager'
    ];


  /* ========================================================
     TV ON
  ======================================================== */

  if (roomsTVOn) {

    if (manager) {

      manager.startEmitter(
        tvSoundEntity
      );


    } else if (
      tvSoundEntity.components &&
      tvSoundEntity.components.sound
    ) {

      try {

        tvSoundEntity.components
          .sound
          .playSound();

      } catch (error) {

        console.error(
          'Could not start TV static:',
          error
        );
      }
    }


    console.log(
      'TV static ON.'
    );


  /* ========================================================
     TV OFF
  ======================================================== */

  } else {

    if (manager) {

      manager.stopEmitter(
        tvSoundEntity
      );


    } else if (
      tvSoundEntity.components &&
      tvSoundEntity.components.sound
    ) {

      try {

        tvSoundEntity.components
          .sound
          .stopSound();

      } catch (error) {

        console.error(
          'Could not stop TV static:',
          error
        );
      }
    }


    console.log(
      'TV static OFF.'
    );
  }
}


/* ============================================================
   MASTER VOLUME

   amount examples:

       -0.1
       +0.1

============================================================ */

function changeRoomsVolume(
  amount
) {

  roomsMasterVolume =
    THREE.MathUtils.clamp(
      roomsMasterVolume +
      amount,

      0,

      1
    );


  /*
    Increasing volume while muted
    does not automatically unmute.
  */
  applyRoomsVolume();
}


/* ============================================================
   MUTE / UNMUTE
============================================================ */

function toggleRoomsMute() {

  roomsMuted =
    !roomsMuted;


  applyRoomsVolume();
}


/* ============================================================
   APPLY MASTER VOLUME TO EVERYTHING
============================================================ */

function applyRoomsVolume() {

  const scene =
    document.querySelector(
      'a-scene'
    );


  if (scene) {

    const manager =
      scene.components[
        'spatial-audio-manager'
      ];


    if (manager) {

      manager.updateVolumes();
    }
  }


  /* ----------------------------------------------------------
     NORMAL PLAYER FOOTSTEPS
  ---------------------------------------------------------- */

  const footsteps =
    document.getElementById(
      'footstepAudio'
    );


  if (footsteps) {

    footsteps.volume =
      getFinalVolume(
        0.18
      );
  }


  /* ----------------------------------------------------------
     SCARE FOOTSTEPS
  ---------------------------------------------------------- */

  const scareFootsteps =
    document.getElementById(
      'scareFootstepAudio'
    );


  if (scareFootsteps) {

    scareFootsteps.volume =
      getFinalVolume(
        0.18
      );
  }


  updateRoomsVolumeUI();
}


/* ============================================================
   UPDATE MAC + QUEST VOLUME LABELS
============================================================ */

function updateRoomsVolumeUI() {

  const percentage =
    Math.round(
      roomsMasterVolume *
      100
    );


  const text =
    roomsMuted
      ? 'MUTE'
      : `${percentage}%`;


  /* ----------------------------------------------------------
     MAC
  ---------------------------------------------------------- */

  const screenLabel =
    document.getElementById(
      'screenVolumeLabel'
    );


  if (screenLabel) {

    screenLabel.textContent =
      text;
  }


  /* ----------------------------------------------------------
     QUEST
  ---------------------------------------------------------- */

  const vrLabel =
    document.getElementById(
      'vrVolumeLabel'
    );


  if (vrLabel) {

    vrLabel.setAttribute(
      'value',
      text
    );
  }


  const vrMuteLabel =
    document.getElementById(
      'vrMuteLabel'
    );


  if (vrMuteLabel) {

    vrMuteLabel.setAttribute(
      'value',
      roomsMuted
        ? 'X'
        : 'M'
    );
  }
}


/* ============================================================
   PLAYER FOOTSTEPS

   Attached to #rig:

       footstep-player="
         minSpeed: 0.02;
         maxSpeed: 4"

============================================================ */

AFRAME.registerComponent(
  'footstep-player',
  {

    schema: {

      minSpeed: {
        default: 0.02
      },

      maxSpeed: {
        default: 4
      },

      volume: {
        default: 0.18
      }
    },


    init:
      function () {

        this.audio =
          document.getElementById(
            'footstepAudio'
          );


        this.previousPosition =
          new THREE.Vector3();


        this.currentPosition =
          new THREE.Vector3();


        this.hasPreviousPosition =
          false;


        this.walking =
          false;


        if (this.audio) {

          this.audio.loop =
            true;


          this.audio.volume =
            getFinalVolume(
              this.data.volume
            );
        }
      },


    /* ======================================================
       START FOOTSTEPS
    ====================================================== */

    start:
      function () {

        if (
          !this.audio ||
          this.walking
        ) {
          return;
        }


        const scene =
          this.el.sceneEl;


        /*
          Don't attempt playback until
          the user enables audio.
        */
        if (
          !scene ||
          !scene.audioUnlocked
        ) {
          return;
        }


        this.walking =
          true;


        this.audio.volume =
          getFinalVolume(
            this.data.volume
          );


        const promise =
          this.audio.play();


        if (
          promise &&
          typeof promise.catch ===
            'function'
        ) {

          promise.catch(
            () => {

              this.walking =
                false;
            }
          );
        }
      },


    /* ======================================================
       STOP FOOTSTEPS
    ====================================================== */

    stop:
      function () {

        if (!this.audio) {
          return;
        }


        if (!this.walking) {
          return;
        }


        this.walking =
          false;


        this.audio.pause();


        /*
          Reset the loop so the next walk
          starts from the beginning.
        */
        try {

          this.audio.currentTime =
            0;

        } catch (error) {

          /*
            Some browsers can reject changing
            currentTime before metadata loads.
          */
        }
      },


    /* ======================================================
       DETECT PLAYER MOVEMENT
    ====================================================== */

    tick:
      function (
        time,
        deltaTime
      ) {

        if (
          !deltaTime ||
          !this.audio
        ) {
          return;
        }


        this.el.object3D
          .getWorldPosition(
            this.currentPosition
          );


        if (
          !this.hasPreviousPosition
        ) {

          this.previousPosition
            .copy(
              this.currentPosition
            );


          this.hasPreviousPosition =
            true;


          return;
        }


        const dt =
          deltaTime /
          1000;


        if (dt <= 0) {
          return;
        }


        /*
          Ignore vertical movement.

          Walking speed should be calculated
          along the floor.
        */
        const dx =
          this.currentPosition.x -
          this.previousPosition.x;


        const dz =
          this.currentPosition.z -
          this.previousPosition.z;


        const distance =
          Math.sqrt(
            dx * dx +
            dz * dz
          );


        const speed =
          distance /
          dt;


        this.previousPosition
          .copy(
            this.currentPosition
          );


        /* --------------------------------------------------
           WALKING
        -------------------------------------------------- */

        if (
          speed >=
            this.data.minSpeed &&

          speed <=
            this.data.maxSpeed
        ) {

          this.start();


        /* --------------------------------------------------
           STOPPED
        -------------------------------------------------- */

        } else {

          this.stop();
        }
      },


    remove:
      function () {

        this.stop();
      }
  }
);


/* ============================================================
   PUBLIC FUNCTIONS

   Other split files and HTML can call these.
============================================================ */

window.enableSound =
  enableSound;


window.setRoomsTVState =
  setRoomsTVState;


window.changeRoomsVolume =
  changeRoomsVolume;


window.toggleRoomsMute =
  toggleRoomsMute;


window.updateRoomsVolumeUI =
  updateRoomsVolumeUI;