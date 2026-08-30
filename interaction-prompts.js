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
      document.querySelector('#cam') &&
      document
        .querySelector('#cam')
        .getObject3D('camera')
    );

  if (!canvas || !camera) {
    return false;
  }

  const rect =
    canvas.getBoundingClientRect();

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

  entity.object3D.updateWorldMatrix(
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