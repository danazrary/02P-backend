import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import fs from "fs";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
dotenv.config();

// Set up AWS S3 client configuration
const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION, // Replace with your AWS region, e.g., "us-east-1"
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME; // Your S3 bucket name
export async function getImageUrlFromCDN({ keys }) {
  const keyStringRaw = Array.isArray(keys) ? keys.join("/") : keys;

  // Handle full S3 URLs like https://bucket-name.s3.amazonaws.com/folder/file.png
  let keyString = keyStringRaw;
  if (keyStringRaw.includes("amazonaws.com/")) {
    const parts = keyStringRaw.split("amazonaws.com/");
    keyString = parts[1] || keyStringRaw; // fallback to raw if split fails
  }

  // Always ensure CloudFront returns HTTPS
  const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;

  return `https://${CLOUDFRONT_DOMAIN}/${keyString}`;
}



export async function uploadImageToS3(filePath, key ) {

  
  try {
    const fileStream =
      typeof filePath === "string" ? fs.createReadStream(filePath) : filePath;
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME, // Your bucket name
      Key: key, // The name of the file to be saved in S3
      Body: fileStream, // File buffer
     
    };

    // Upload the file to S3
    const data = await s3Client.send(new PutObjectCommand(uploadParams));

    return data;
  } catch (err) {
    console.error("Error uploading image:", err);
    throw err;
  }
} 
export async function deleteImagesFromS3(imageKeys) {
  try {
    // Create an array of objects to delete
    const objectsToDelete = imageKeys.map((key) => ({
      Key: key,
    }));

    // Create the command to delete objects
    const deleteParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Delete: {
        Objects: objectsToDelete,
        Quiet: false, // Set to true to suppress the response for deleted objects
      },
    };

    const command = new DeleteObjectsCommand(deleteParams);
    const response = await s3Client.send(command);

   
    return {
      success: true,
      message: "Images deleted successfully.",
      deletedImages: response.Deleted,
    };
  } catch (error) {
    console.error("Error deleting images from S3:", error);
    return {
      success: false,
      message: "Failed to delete images.",
      error: error.message,
    };
  }
}