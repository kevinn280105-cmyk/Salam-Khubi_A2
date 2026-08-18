/* ============================================================
   audio.js
   POSITIONAL ROOM AUDIO + FOOTSTEPS + MASTER VOLUME

   Main changes:
   - Fan, rain, fluorescent light and TV are now 3D positional.
   - Walking closer makes a sound louder.
   - Walking away makes it quieter.
   - Turning your head changes left/right direction.
   - Overall volumes are lower.
   - Player footsteps remain attached to the player.
============================================================ */


/* ============================================================
   ROOM SOUND LOCATIONS

   These coordinates are starting positions.

   Later, if the TV/fan/etc. are in slightly different places
   inside your GLB, we only need to change the position values
   here. We do NOT need to rewrite the sound system.
============================================================ */

const ROOM_SOUND_DEFINITIONS = [

  /* --------------------------------------------------------
     CEILING FAN
  -------------------------------------------------------- */
  {
    id: 'fanSound',

    src:
      'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',

    position:
      '-3.5 2.4 -1',

    /*
      Much quieter than the old 0.20.
    */
    baseVolume:
      0.075,

    /*
      Within roughly this distance,
      the sound remains fairly clear.
    */
    refDistance:
      1.4,

    /*
      Higher value = fades faster
      when walking away.
    */
    rolloffFactor:
      1.8,

    maxDistance:
      9
  },


  /* --------------------------------------------------------
     BEDROOM RAIN
  -------------------------------------------------------- */
  {
    id: 'bedroomRainSound',

    src:
      'sounds/bedroom-rain.wav',

    position:
      '-3.2 1.7 -3.8',

    baseVolume:
      0.060,

    /*
      Rain spreads further than the
      smaller mechanical sounds.
    */
    refDistance:
      2.2,

    rolloffFactor:
      1.25,

    maxDistance:
      13
  },


  /* --------------------------------------------------------
     FLUORESCENT LIGHT
  -------------------------------------------------------- */
  {
    id: 'fluorescentSound',

    src:
      'sounds/fluorescent-light.wav',

    position:
      '2.5 2.5 1.5',

    baseVolume:
      0.045,

    refDistance:
      1.2,

    rolloffFactor:
      2.0,

    maxDistance:
      8
  },


  /* --------------------------------------------------------
     TV STATIC
  -------------------------------------------------------- */
  {
    id: 'tvStaticSound',

    src:
      'sounds/tv-static.mp3',

    position:
      '2.2 1.15 -1.8',

    /*
      TV is deliberately very quiet.
      It should become noticeable mainly
      when the player gets closer.
    */
    baseVolume:
      0.025,

    refDistance:
      1.0,

    rolloffFactor:
      2.25,

    maxDistance:
      7
  }
];


/* ============================================================
   MASTER AUDIO STATE
============================================================ */

/*
  1 = 100%
  0.5 = 50%

  The settings menu changes this.
*/
let roomsMasterVolume =
  1;


/*
  True means all project audio
  becomes silent.
*/
let roomsMuted =
  false;


/* ============================================================
   POSITIONAL AUDIO MANAGER

   This component is attached to <a-scene>:

   <a-scene spatial-audio-manager>
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {

    init: function () {

      /*
        Store all generated positional
        sound entities here.
      */
      this.emitters =
        [];


      this.createEmitters();


      /*
        Listen for changes from the
        Settings menu.
      */
      this.el.addEventListener(
        'audio-settings-changed',

        () => {
          this.applyVolumes();
        }
      );
    },


    /* ======================================================
       CREATE ALL ROOM SOUND SOURCES
    ====================================================== */

    createEmitters:
      function () {

        ROOM_SOUND_DEFINITIONS
          .forEach(
            (definition) => {

              /*
                Create one invisible entity
                at the location where the
                sound should come from.
              */
              const entity =
                document.createElement(
                  'a-entity'
                );


              entity.setAttribute(
                'id',
                definition.id
              );


              entity.setAttribute(
                'class',
                'spatial-sound'
              );


              entity.setAttribute(
                'position',
                definition.position
              );


              /*
                Remember the original volume.

                Master volume will multiply
                this later.
              */
              entity.dataset.baseVolume =
                String(
                  definition.baseVolume
                );


              /*
                A-Frame positional sound.

                positional: true means this
                sound exists at a location
                in the 3D world.
              */
              entity.setAttribute(
                'sound',

                [
                  `src: url(${definition.src})`,

                  'autoplay: false',

                  'loop: true',

                  'positional: true',

                  `volume: ${definition.baseVolume}`,

                  'distanceModel: inverse',

                  `refDistance: ${definition.refDistance}`,

                  `rolloffFactor: ${definition.rolloffFactor}`,

                  `maxDistance: ${definition.maxDistance}`
                ].join('; ')
              );


              /*
                Put it into the scene.
              */
              this.el.appendChild(
                entity
              );


              this.emitters.push(
                entity
              );
            }
          );
      },


    /* ======================================================
       START ONE POSITIONAL SOUND
    ====================================================== */

    startEmitter:
      function (entity) {

        const tryPlay =
          () => {

            const soundComponent =
              entity.components &&
              entity.components.sound;


            /*
              Component might not be ready
              on the exact frame the user
              presses ENABLE SOUND.
            */
            if (!soundComponent) {
              return false;
            }


            try {

              soundComponent
                .playSound();


              return true;

            } catch (error) {

              console.error(
                'Could not start positional sound:',
                entity.id,
                error
              );


              return false;
            }
          };


        /*
          Usually it is already ready.
        */
        if (tryPlay()) {
          return;
        }


        /*
          If not, wait until A-Frame says
          the sound component is ready.
        */
        const onComponentInitialized =
          (event) => {

            if (
              !event.detail ||
              event.detail.name !==
                'sound'
            ) {
              return;
            }


            entity.removeEventListener(
              'componentinitialized',
              onComponentInitialized
            );


            tryPlay();
          };


        entity.addEventListener(
          'componentinitialized',
          onComponentInitialized
        );
      },


    /* ======================================================
       START ALL POSITIONAL SOUNDS
    ====================================================== */

    playAll:
      function () {

        this.emitters.forEach(
          (entity) => {

            this.startEmitter(
              entity
            );
          }
        );


        console.log(
          `${this.emitters.length} positional room sound(s) requested.`
        );
      },


    /* ======================================================
       APPLY MASTER VOLUME
    ====================================================== */

    applyVolumes:
      function () {

        const multiplier =
          roomsMuted

            ? 0

            : roomsMasterVolume;


        this.emitters.forEach(
          (entity) => {

            const base =
              Number(
                entity.dataset
                  .baseVolume
              );


            if (
              !Number.isFinite(
                base
              )
            ) {
              return;
            }


            entity.setAttribute(
              'sound',
              'volume',
              base *
              multiplier
            );
          }
        );
      }
  }
);


/* ============================================================
   PRIME NORMAL HTML AUDIO

   Footsteps are different from room ambience.

   The footstep sound belongs to the PLAYER rather than a point
   in the environment, so it remains a normal <audio> element.

   This function briefly starts it silently during the user's
   ENABLE SOUND click so the Quest browser gives us permission
   to play it later while walking.
============================================================ */

async function primeHtmlAudio(
  element,
  finalVolume
) {

  if (!element) {
    return;
  }


  try {

    /*
      Start silently.
    */
    element.volume =
      0;


    await element.play();


    /*
      Immediately stop it again.
    */
    element.pause();


    element.currentTime =
      0;


    /*
      Restore wanted volume.
    */
    element.volume =
      finalVolume;

  } catch (error) {

    /*
      Even if priming fails, make sure
      it has the proper volume for later.
    */
    element.volume =
      finalVolume;


    console.warn(
      'Audio could not be primed yet:',
      element.id,
      error
    );
  }
}


/* ============================================================
   ENABLE SOUND BUTTON

   Called from index.html:

   onclick="enableSound()"
============================================================ */

async function enableSound() {

  const button =
    document.querySelector(
      '#soundButton'
    );


  const scene =
    document.querySelector(
      'a-scene'
    );


  if (
    !button ||
    !scene
  ) {
    return;
  }


  button.textContent =
    'STARTING SOUND...';


  button.disabled =
    true;


  /* ========================================================
     RESUME WEB AUDIO

     Browsers normally block audio until
     the user performs a real click.
  ======================================================== */

  try {

    const context =
      THREE.AudioContext
        .getContext();


    if (
      context &&
      context.state ===
        'suspended'
    ) {

      await context.resume();
    }

  } catch (error) {

    console.warn(
      'Web Audio could not be resumed:',
      error
    );
  }


  /* ========================================================
     UNLOCK PLAYER FOOTSTEPS
  ======================================================== */

  await primeHtmlAudio(

    document.querySelector(
      '#footstepAudio'
    ),

    0.18
  );


  /* ========================================================
     UNLOCK JUMPSCARE FOOTSTEPS

     This is a SEPARATE audio element even
     though it uses the same WAV file.

     That stops the normal walking system
     from accidentally pausing the scare.
  ======================================================== */

  await primeHtmlAudio(

    document.querySelector(
      '#scareFootstepAudio'
    ),

    0.35
  );


  /* ========================================================
     START POSITIONAL ROOM AUDIO
  ======================================================== */

  const manager =
    scene.components[
      'spatial-audio-manager'
    ];


  if (manager) {

    manager.playAll();

  } else {

    console.error(
      'spatial-audio-manager was not found on <a-scene>.'
    );
  }


  /*
    Tell footstep-player that audio
    permission has been granted.
  */
  scene.audioUnlocked =
    true;


  /*
    Apply current master volume.
  */
  applyRoomsAudioSettings();


  button.textContent =
    'SOUND ENABLED';


  /*
    Hide button after successful
    activation.
  */
  window.setTimeout(
    () => {

      button.style.display =
        'none';

    },

    1000
  );


  console.log(
    'Room audio enabled.'
  );
}


/* ============================================================
   APPLY MASTER SETTINGS

   This updates:

   - positional ambience
   - player footsteps
   - jumpscare footsteps
============================================================ */

function applyRoomsAudioSettings() {

  const scene =
    document.querySelector(
      'a-scene'
    );


  const multiplier =
    roomsMuted

      ? 0

      : roomsMasterVolume;


  /* --------------------------------------------------------
     PLAYER FOOTSTEPS
  -------------------------------------------------------- */

  const footsteps =
    document.querySelector(
      '#footstepAudio'
    );


  if (footsteps) {

    footsteps.volume =
      Math.max(
        0,

        Math.min(
          1,

          0.18 *
          multiplier
        )
      );
  }


  /* --------------------------------------------------------
     JUMPSCARE FOOTSTEPS
  -------------------------------------------------------- */

  const scareFootsteps =
    document.querySelector(
      '#scareFootstepAudio'
    );


  if (scareFootsteps) {

    scareFootsteps.volume =
      Math.max(
        0,

        Math.min(
          1,

          0.35 *
          multiplier
        )
      );
  }


  /* --------------------------------------------------------
     POSITIONAL AMBIENCE

     ui-scare.js also listens for this
     so its volume label updates.
  -------------------------------------------------------- */

  if (scene) {

    scene.emit(
      'audio-settings-changed',

      {
        volume:
          roomsMasterVolume,

        muted:
          roomsMuted
      },

      false
    );
  }
}


/* ============================================================
   VOLUME DOWN / UP

   ui-scare.js calls this.
============================================================ */

function changeRoomsVolume(
  delta
) {

  /*
    If user adjusts volume while muted,
    automatically unmute.
  */
  if (roomsMuted) {

    roomsMuted =
      false;
  }


  /*
    Limit master volume between:

    20% and 100%
  */
  roomsMasterVolume =
    Math.max(

      0.2,

      Math.min(

        1,

        roomsMasterVolume +
        delta
      )
    );


  applyRoomsAudioSettings();
}


/* ============================================================
   MUTE / UNMUTE
============================================================ */

function toggleRoomsMute() {

  roomsMuted =
    !roomsMuted;


  applyRoomsAudioSettings();
}


/* ============================================================
   LET OTHER FILES READ CURRENT AUDIO SETTINGS
============================================================ */

function getRoomsAudioState() {

  return {

    volume:
      roomsMasterVolume,


    muted:
      roomsMuted,


    effectiveVolume:
      roomsMuted

        ? 0

        : roomsMasterVolume
  };
}


/* ============================================================
   EXPOSE FUNCTIONS GLOBALLY

   Needed because index.html and ui-scare.js
   call these functions.
============================================================ */

window.enableSound = enableSound;
window.changeRoomsVolume = changeRoomsVolume;
window.toggleRoomsMute = toggleRoomsMute;
window.getRoomsAudioState = getRoomsAudioState;
window.applyRoomsAudioSettings = applyRoomsAudioSettings;

/* ============================================================
   PLAYER FOOTSTEP SYSTEM
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
      }
    },


    init: function () {

      /*
        Remember where the player was
        last frame.
      */
      this.previousPosition =
        this.el.object3D
          .position
          .clone();


      /*
        Normal player walking audio.
      */
      this.audio =
        document.querySelector(
          '#footstepAudio'
        );


      this.isPlaying =
        false;


      /*
        Footsteps are now quieter than
        the old 0.30.
      */
      if (this.audio) {

        this.audio.volume =
          0.18;
      }
    },


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


        const currentPosition =
          this.el.object3D
            .position;


        const deltaX =
          currentPosition.x -
          this.previousPosition.x;


        const deltaZ =
          currentPosition.z -
          this.previousPosition.z;


        /*
          Ignore vertical movement.

          Footsteps should happen because
          the player WALKED horizontally.
        */
        const distance =
          Math.sqrt(
            deltaX *
            deltaX +

            deltaZ *
            deltaZ
          );


        const speed =
          distance /
          (
            deltaTime /
            1000
          );


        /*
          Movement must be fast enough
          to count as walking but not so
          fast that teleporting triggers
          footsteps.
        */
        const isWalking =
          speed >=
            this.data.minSpeed &&

          speed <=
            this.data.maxSpeed;


        /*
          Sound only starts after the
          player pressed ENABLE SOUND.
        */
        const audioUnlocked =
          this.el.sceneEl
            .audioUnlocked;


        /* ==================================================
           START FOOTSTEPS
        ================================================== */

        if (
          isWalking &&
          audioUnlocked &&
          !this.isPlaying
        ) {

          const playPromise =
            this.audio.play();


          if (playPromise) {

            playPromise.catch(
              (error) => {

                console.error(
                  'Footstep sound failed:',
                  error
                );
              }
            );
          }


          this.isPlaying =
            true;


        /* ==================================================
           STOP FOOTSTEPS
        ================================================== */

        } else if (

          (
            !isWalking ||
            !audioUnlocked
          ) &&

          this.isPlaying

        ) {

          this.audio.pause();


          this.audio.currentTime =
            0;


          this.isPlaying =
            false;
        }


        /*
          Save current player position for
          comparison on the next frame.
        */
        this.previousPosition.copy(
          currentPosition
        );
      }
  }
);
