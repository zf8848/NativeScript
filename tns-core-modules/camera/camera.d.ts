﻿/**
 * Allows you to take pictrues with the device's camera.
 */
declare module "camera" {

    import * as imageSource from "image-source";

    /**
     * [Deprecated. Please use same functionality from `nativescript-camera` npm module]
     */
    export function takePicture(options?: CameraOptions): Promise<imageSource.ImageSource>;
    
    /**
     * [Deprecated. Please use same functionality from `nativescript-camera` npm module]
     */
    export function isAvailable(): Boolean;

    /**
     * [Deprecated. Please use same functionality from `nativescript-camera` npm module]
     */
    export interface CameraOptions {
        /**
         * Defines the desired width (in device independent pixels) of the taken image. It should be used with height property.
         * If `keepAspectRatio` actual image width could be different in order to keep the aspect ratio of the original camera image.
         * The actual image width will be greater than requested if the display density of the device is higher (than 1) (full HD+ resolutions).
         */
        width?: number;

        /**
         * Defines the desired height (in device independent pixels) of the taken image. It should be used with width property.
         * If `keepAspectRatio` actual image width could be different in order to keep the aspect ratio of the original camera image.
         * The actual image height will be greater than requested if the display density of the device is higher (than 1) (full HD+ resolutions).
         */
        height?: number;

        /**
         * Defines if camera picture aspect ratio should be kept during picture resizing.
         * This property could affect width or heigth return values.
         */
        keepAspectRatio?: boolean;
        
        /**
         * Defines if camera picture should be copied to photo Gallery (Android) or Photos (iOS) 
         */
        saveToGallery?: boolean;
    }
}
