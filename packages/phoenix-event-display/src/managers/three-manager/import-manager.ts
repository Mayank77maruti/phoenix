import {
  DoubleSide,
  Mesh,
  LineSegments,
  LineBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  Plane,
  Material,
  ObjectLoader,
  Color,
  FrontSide,
  Vector3,
  Matrix4,
  REVISION,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GeometryUIParameters } from '../../lib/types/geometry-ui-parameters';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import JSZip from 'jszip';

/**
 * Manager for managing event display's import related functionality.
 */
export class ImportManager {
  /** Planes for clipping geometry. */
  private clipPlanes: Plane[];
  /** Object group ID containing event data. */
  private EVENT_DATA_ID: string;
  /** Object group ID containing detector geometries. */
  private GEOMETRIES_ID: string;

  /**
   * Constructor for the import manager.
   * @param clipPlanes Planes for clipping geometry.
   * @param EVENT_DATA_ID Object group ID containing event data.
   * @param GEOMETRIES_ID Object group ID containing detector geometries.
   */
  constructor(
    clipPlanes: Plane[],
    EVENT_DATA_ID: string,
    GEOMETRIES_ID: string,
  ) {
    this.clipPlanes = clipPlanes;
    this.EVENT_DATA_ID = EVENT_DATA_ID;
    this.GEOMETRIES_ID = GEOMETRIES_ID;
  }

  /**
   * Loads an OBJ (.obj) geometry from the given filename.
   * @param filename Path to the geometry.
   * @param name Name given to the geometry.
   * @param color Color to initialize the geometry.
   * @param doubleSided Renders both sides of the material.
   * @param setFlat Whether object should be flat-shaded or not.
   * @returns Promise for loading the geometry.
   */
  public loadOBJGeometry(
    filename: string,
    name: string,
    color: any,
    doubleSided: boolean,
    setFlat: boolean,
  ): Promise<GeometryUIParameters> {
    color = color ?? 0x41a6f4;
    const objLoader = new OBJLoader();

    return new Promise<GeometryUIParameters>((resolve, reject) => {
      objLoader.load(
        filename,
        (object) => {
          const processedObject = this.processOBJ(
            object,
            name,
            color,
            doubleSided,
            setFlat,
          );
          resolve({ object: processedObject });
        },
        () => {},
        (error) => {
          reject(error);
        },
      );
    });
  }

  /**
   * Parses and loads a geometry in OBJ (.obj) format.
   * @param geometry Geometry in OBJ (.obj) format.
   * @param name Name given to the geometry.
   * @returns The processed object.
   */
  public parseOBJGeometry(geometry: string, name: string): Object3D {
    const objLoader = new OBJLoader();
    const object = objLoader.parse(geometry);
    return this.processOBJ(object, name, 0x41a6f4, false, false);
  }

  /**
   * Process the geometry object being loaded from OBJ (.obj) format.
   * @param object 3D object.
   * @param name Name of the object.
   * @param color Color of the object.
   * @param doubleSided Renders both sides of the material.
   * @param setFlat Whether object should be flat-shaded or not.
   * @returns The processed object.
   */
  private processOBJ(
    object: Object3D,
    name: string,
    color: any,
    doubleSided: boolean,
    setFlat: boolean,
  ): Object3D {
    object.name = name;
    object.userData = { name };
    return this.setObjFlat(object, color, doubleSided, setFlat);
  }

  /**
   * Process the 3D object and flatten it.
   * @param object3d Group of geometries that make up the object.
   * @param color Color of the object.
   * @param doubleSided Renders both sides of the material.
   * @param setFlat Whether object should be flat-shaded or not.
   * @returns The processed object.
   */
  private setObjFlat(
    object3d: Object3D,
    color: any,
    doubleSided: boolean,
    setFlat: boolean,
  ): Object3D {
    const material2 = new MeshPhongMaterial({
      color: color,
      shininess: 0,
      wireframe: false,
      clippingPlanes: this.clipPlanes,
      clipIntersection: true,
      clipShadows: false,
      side: doubleSided ? DoubleSide : FrontSide,
      flatShading: setFlat,
    });

    object3d.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        child.name = object3d.name;
        child.userData = object3d.userData;
        child.userData.size = this.getObjectSize(child);
        // Use the new material
        if (child.material instanceof Material) {
          child.material.dispose();
          child.material = material2;
        }
        // enable casting shadows
        child.castShadow = false;
        child.receiveShadow = false;
      } else {
        if (
          child instanceof LineSegments &&
          child.material instanceof LineBasicMaterial
        ) {
          (child.material.color as Color).set(color);
        }
      }
    });
    return object3d;
  }

  /**
   * Parses and loads a scene in Phoenix (.phnx) format.
   * @param scene Geometry in Phoenix (.phnx) format.
   * @param callback Callback called after the scene is loaded.
   * @returns Promise for loading the scene.
   */
  public parsePhnxScene(
    scene: any,
    callback: (geometries?: Object3D, eventData?: Object3D) => void,
  ): Promise<void> {
    const loader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      `https://cdn.jsdelivr.net/npm/three@0.${REVISION}.0/examples/jsm/libs/draco/`,
    );
    loader.setDRACOLoader(dracoLoader);

    const sceneString = JSON.stringify(scene, null, 2);

    return new Promise<void>((resolve, reject) => {
      loader.parse(
        sceneString,
        '',
        (gltf) => {
          const eventData = gltf.scene.getObjectByName(this.EVENT_DATA_ID);
          const geometries = gltf.scene.getObjectByName(this.GEOMETRIES_ID);
          callback(eventData, geometries);
          resolve();
        },
        (error) => {
          reject(error);
        },
      );
    });
  }

  /**
   * handles some file content and loads a Geometry contained..
   * It deals with zip file cases and then
   * calls the given method on each file found
   * @param path path of the original file
   * @param filename name of the original file
   * @param data content of the original file
   * @param callback the method to be called on each file content
   * @param resolve the method to be called on success
   * @param reject the method to be called on failure
   */
  private zipHandlingInternal(
    path: string,
    filename: string,
    data: ArrayBuffer,
    callback: (
      fileContent: ArrayBuffer,
      path: string,
      name: string,
    ) => Promise<GeometryUIParameters[]>,
    resolve: any,
    reject: any,
  ) {
    if (filename.split('.').pop() == 'zip') {
      JSZip.loadAsync(data).then((archive) => {
        const promises: Promise<any>[] = [];
        for (const filePath in archive.files) {
          promises.push(
            archive
              .file(filePath)
              .async('arraybuffer')
              .then((fileData) => {
                return callback(fileData, path, filePath.split('.')[0]);
              }),
          );
        }
        let allGeometriesUIParameters: GeometryUIParameters[] = [];
        Promise.all(promises).then((geos) => {
          geos.forEach((geo) => {
            allGeometriesUIParameters = allGeometriesUIParameters.concat(geo);
          });
          resolve(allGeometriesUIParameters);
        });
      });
    } else {
      callback(data, path, filename.split('.')[0]).then(
        (geo) => {
          resolve(geo);
        },
        (error) => {
          reject(error);
        },
      );
    }
  }

  /**
   * Wraps a method taking a file and returning a Promise for
   * loading a Geometry. It deals with zip file cases and then
   * calls the original method on each file found
   * @param file the original file
   * @param callback the original method
   * @returns Promise for loading the geometry.
   */
  private zipHandlingFileWrapper(
    file: File,
    callback: (
      fileContent: ArrayBuffer,
      path: string,
      name: string,
    ) => Promise<GeometryUIParameters[]>,
  ): Promise<GeometryUIParameters[]> {
    return new Promise<GeometryUIParameters[]>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        this.zipHandlingInternal(
          '',
          file.name,
          reader.result as ArrayBuffer,
          callback,
          resolve,
          reject,
        );
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Wraps a method taking a URL and returning a Promise for
   * loading a Geometry. It deals with zip file cases and then
   * calls the original method on each file found
   * @param file the original file
   * @param callback the original method
   * @returns Promise for loading the geometry.
   */
  private zipHandlingURLWrapper(
    file: string,
    callback: (
      fileContent: ArrayBuffer,
      path: string,
      name: string,
    ) => Promise<GeometryUIParameters[]>,
  ): Promise<GeometryUIParameters[]> {
    return new Promise<GeometryUIParameters[]>((resolve, reject) => {
      fetch(file).then((response) => {
        return response.arrayBuffer().then((data) => {
          this.zipHandlingInternal(
            file.substr(0, file.lastIndexOf('/')),
            file,
            data,
            callback,
            resolve,
            reject,
          );
        });
      });
    });
  }

  /**
   * Loads a GLTF (.gltf,.glb) scene(s)/geometry from the given URL.
   * also support zipped versions of the files
   * @param sceneUrl URL to the GLTF (.gltf/.glb or a zip with such file(s)) file.
   * @param name Name of the loaded scene/geometry if a single scene is present, ignored if several scenes are present.
   * @param menuNodeName Path to the node in Phoenix menu to add the geometry to. Use `>` as a separator.
   * @param scale Scale of the geometry.
   * @param initiallyVisible Whether the geometry is initially visible or not.
   * @returns Promise for loading the geometry.
   */
  public loadGLTFGeometry(
    sceneUrl: string,
    name: string,
    menuNodeName: string,
    scale: number,
    initiallyVisible: boolean,
  ): Promise<GeometryUIParameters[]> {
    return this.zipHandlingURLWrapper(
      sceneUrl,
      (data: ArrayBuffer, path: string, ignoredName: string) => {
        return this.loadGLTFGeometryInternal(
          data,
          path,
          name,
          menuNodeName,
          scale,
          initiallyVisible,
        );
      },
    );
  }

  /**
   * Loads a GLTF (.gltf) scene(s)/geometry from the given ArrayBuffer.
   * @param sceneData ArrayBuffer containing the geometry file's content (gltf or glb data)
   * @param path The base path from which to find subsequent glTF resources such as textures and .bin data files
   * @param name Name of the loaded scene/geometry if a single scene is present, ignored if several scenes are present.
   * @param menuNodeName Path to the node in Phoenix menu to add the geometry to. Use `>` as a separator.
   * @param scale Scale of the geometry.
   * @param initiallyVisible Whether the geometry is initially visible or not.
   * @returns Promise for loading the geometry.
   */
  private loadGLTFGeometryInternal(
    sceneData: ArrayBuffer,
    path: string,
    name: string,
    menuNodeName: string,
    scale: number,
    initiallyVisible: boolean,
  ): Promise<GeometryUIParameters[]> {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      `https://cdn.jsdelivr.net/npm/three@0.${REVISION}.0/examples/jsm/libs/draco/`,
    );
    loader.setDRACOLoader(dracoLoader);

    return new Promise<GeometryUIParameters[]>((resolve, reject) => {
      loader.parse(
        sceneData,
        path,
        (gltf) => {
          const allGeometries: GeometryUIParameters[] = [];

          for (const scene of gltf.scenes) {
            scene.visible = scene.userData.visible ?? initiallyVisible;
            const sceneName = this.processGLTFSceneName(
              scene.name,
              menuNodeName,
            );

            const materials: {
              [key: string]: {
                material: Material;
                geoms: any[];
                renderOrder: number;
              };
            } = {};
            const findMeshes = (
              node: Object3D,
              parentMatrix: Matrix4,
              depth: number,
            ) => {
              const mat = parentMatrix.clone().multiply(node.matrix);
              if (node instanceof Mesh) {
                const key = ((node as Mesh).material as any).id; // ts don't recognize material and prevent compilation...
                if (!materials[key])
                  materials[key] = {
                    material: (node as Mesh).material as Material, // Can be Material[], but not sure this is ever still used.
                    geoms: [],
                    renderOrder: -depth,
                  };

                materials[key].geoms.push(
                  (node as Mesh).geometry.clone().applyMatrix4(mat),
                );
              }

              for (const obj of node.children) {
                findMeshes(obj, mat, depth + 1);
              }
            };

            findMeshes(scene, new Matrix4(), 0);

            // Improve renderorder for transparent materials
            scene.remove(...scene.children);
            for (const val of Object.values(materials)) {
              const mesh = new Mesh(
                BufferGeometryUtils.mergeGeometries((val as any).geoms),
                (val as any).material,
              );
              mesh.renderOrder = (val as any).renderOrder;
              scene.add(mesh);
            }

            this.processGeometry(
              scene,
              name ?? sceneName?.name,
              scale,
              true, // doublesided
            );

            allGeometries.push({
              object: scene,
              menuNodeName: menuNodeName ?? sceneName?.menuNodeName,
            });
          }
          resolve(allGeometries);
        },
        (error) => {
          reject(error);
        },
      );
    });
  }

  /** Parses and loads a geometry in GLTF (.gltf,.glb) format.
   * Also supports zip versions of those
   * @param fileName of the geometry file (.gltf,.glb or a zip with such file(s))
   * @returns Promise for loading the geometry.
   */
  public parseGLTFGeometry(file: File): Promise<GeometryUIParameters[]> {
    return this.zipHandlingFileWrapper(
      file,
      (data: ArrayBuffer, path: string, name: string) => {
        return this.parseGLTFGeometryFromArrayBuffer(data, path, name);
      },
    );
  }

  /** Parses and loads a geometry in GLTF (.gltf) format.
   * @param geometry ArrayBuffer containing the geometry file's content (gltf or glb data)
   * @param path The base path from which to find subsequent glTF resources such as textures and .bin data files
   * @param name Name given to the geometry.
   * @returns Promise for loading the geometry.
   */
  private parseGLTFGeometryFromArrayBuffer(
    geometry: ArrayBuffer,
    path: string,
    name: string,
  ): Promise<GeometryUIParameters[]> {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      `https://cdn.jsdelivr.net/npm/three@0.${REVISION}.0/examples/jsm/libs/draco/`,
    );
    loader.setDRACOLoader(dracoLoader);
    return new Promise<GeometryUIParameters[]>((resolve, reject) => {
      loader.parse(
        geometry,
        path,
        (gltf) => {
          const allGeometriesUIParameters: GeometryUIParameters[] = [];

          for (const scene of gltf.scenes) {
            scene.visible = scene.userData.visible;
            console.log('Dealing with scene ', scene.name);
            const sceneName = this.processGLTFSceneName(scene.name);
            this.processGeometry(scene, sceneName?.name ?? name);

            allGeometriesUIParameters.push({
              object: scene,
              menuNodeName: sceneName?.menuNodeName,
            });
          }

          resolve(allGeometriesUIParameters);
        },
        (error) => {
          reject(error);
        },
      );
    });
  }

  /**
   * Get geometry name and menuNodeName from GLTF scene name.
   * @param sceneName GLTF scene name.
   * @param menuNodeName Path to the node in Phoenix menu to add the geometry to. Use `>` as a separator.
   * @returns Geometry name and menuNodeName if present in scene name.
   */
  private processGLTFSceneName(sceneName?: string, menuNodeName?: string) {
    if (sceneName) {
      const nodes = sceneName.split('_>_');
      menuNodeName && nodes.unshift(menuNodeName); // eslint-disable-line
      const fullNodeName = nodes.join(' > ');
      nodes.pop();
      const menuName = nodes.join(' > ');

      return { name: fullNodeName, menuNodeName: menuName };
    }
  }

  /**
   * Loads geometries from JSON.
   * @param json JSON or URL to JSON file of the geometry.
   * @param name Name of the geometry or group of geometries.
   * @param scale Scale of the geometry.
   * @param doubleSided Renders both sides of the material.
   * @returns Promise for loading the geometry.
   */
  public loadJSONGeometry(
    json: string | { [key: string]: any },
    name: string,
    scale?: number,
    doubleSided?: boolean,
  ): Promise<GeometryUIParameters> {
    const loader = new ObjectLoader();

    switch (typeof json) {
      case 'string':
        return new Promise<GeometryUIParameters>((resolve, reject) => {
          loader.load(
            json,
            (object: Object3D) => {
              this.processGeometry(object, name, scale, doubleSided);
              resolve({ object });
            },
            undefined,
            (error) => {
              reject(error);
            },
          );
        });
      case 'object':
        return new Promise<GeometryUIParameters>((resolve) => {
          const object = loader.parse(json);
          this.processGeometry(object, name, scale, doubleSided);
          resolve({ object });
        });
    }
  }

  /**
   * Process the geometry by setting up material and clipping attributes.
   * @param geometry Geometry to be processed.
   * @param name Name of the geometry.
   * @param scale Scale of the geometry.
   * @param doubleSided Renders both sides of the material.
   * @param transparent Whether the transparent property of geometry is true or false. Default `false`.
   */
  private processGeometry(
    geometry: Object3D,
    name: string,
    scale?: number,
    doubleSided?: boolean,
  ) {
    geometry.name = name;
    // Set a custom scale if provided
    if (scale) {
      geometry.scale.setScalar(scale);
    }
    geometry.traverse((child) => {
      if (child instanceof Mesh) {
        child.name = child.userData.name = name;
        child.userData.size = this.getObjectSize(child);
        if (child.material instanceof Material) {
          const mat = child.material as Material;
          const color =
            'color' in mat ? (mat.color as Color).getHex() : 0x2fd691;
          const side = doubleSided ? DoubleSide : child.material['side'];

          // Disposing of the default material
          child.material.dispose();

          // Should tranparency be used?
          let isTransparent = false;
          if (geometry.userData.opacity) {
            isTransparent = true;
          }

          // Changing to a material with 0 shininess
          child.material = new MeshPhongMaterial({
            color,
            shininess: 0,
            side: side,
            transparent: isTransparent,
            opacity: geometry.userData.opacity ?? 1,
          });

          // Setting up the clipping planes
          child.material.clippingPlanes = this.clipPlanes;
          child.material.clipIntersection = true;
          child.material.clipShadows = false;
        }
      }
    });
  }

  /**
   * Get the size of object.
   * @param object Object to get the size of.
   * @returns The size (vector) of object as a string.
   */
  private getObjectSize(object: Mesh): string {
    const size = new Vector3();
    object.geometry.computeBoundingBox();
    object.geometry?.boundingBox?.getSize(size);
    return JSON.stringify(size, null, 2);
  }
}
