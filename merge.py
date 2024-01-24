# import os

# def combine_html_files(input_folder, output_file):
#     # Get a list of all HTML files in the input folder
#     html_files = [f for f in os.listdir(input_folder) if f.endswith(".html")]

#     # Check if there are any HTML files
#     if not html_files:
#         print("No HTML files found in the specified folder.")
#         return

#     # Open the output file in write mode
#     with open(output_file, 'w') as output:
#         # Iterate through each HTML file and append its content to the output file
#         for html_file in html_files:
#             # Add a page break between HTML files
#             output.write(f'<div style="page-break-before: always;"></div>')

#             # Read the content of the current HTML file
#             with open(os.path.join(input_folder, html_file), 'r') as input_file:
#                 file_content = input_file.read()

#             # Append the content to the output file
#             output.write(file_content)

#     print(f"HTML files successfully combined into {output_file}")

# # Example usage:
# input_folder = 'Recipes/'
# output_file = 'output.html'
# combine_html_files(input_folder, output_file)
# import os
# import requests
# from bs4 import BeautifulSoup
# from urllib.parse import urlparse, urljoin

# def download_image(url, output_folder):
#     # Extract the image file name from the URL
#     image_name = os.path.basename(urlparse(url).path)

#     # Create the output path for saving the image
#     output_path = os.path.join(output_folder, image_name)

#     try:
#         # Download the image and save it to the output path
#         response = requests.get(url)
#         response.raise_for_status()  # Raise an exception for bad responses
#         with open(output_path, 'wb') as image_file:
#             image_file.write(response.content)
#         return image_name
#     except requests.exceptions.RequestException as e:
#         print(f"Failed to download image from {url}: {e}")
#         return None

# def is_image(url):
#     # Check if the URL has a common image extension
#     image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp']
#     return any(url.lower().endswith(ext) for ext in image_extensions)

# def combine_html_files(input_folder, output_file, image_output_folder):
#     # Get a list of all HTML files in the input folder
#     html_files = [f for f in os.listdir(input_folder) if f.endswith(".html")]

#     # Check if there are any HTML files
#     if not html_files:
#         print("No HTML files found in the specified folder.")
#         return

#     # Open the output file in write mode
#     with open(output_file, 'w') as output:
#         # Iterate through each HTML file
#         for html_file in html_files:
#             # Add a page break between HTML files
#             output.write(f'<div style="page-break-before: always;"></div>')

#             # Read the content of the current HTML file
#             with open(os.path.join(input_folder, html_file), 'r') as input_file:
#                 file_content = input_file.read()

#                 # Parse the HTML content to find image URLs within <a> tags with href attributes
#                 soup = BeautifulSoup(file_content, 'html.parser')
#                 a_tags = soup.find_all('a', href=True)

#                 # Download and save each image linked in <a> tags
#                 for a_tag in a_tags:
#                     img_url = a_tag['href']

#                     if is_image(img_url):
#                         local_image_name = download_image(img_url, image_output_folder)

#                         # Replace the href attribute with the local image path
#                         if local_image_name:
#                             a_tag['href'] = local_image_name

#             # Append the modified content to the output file
#             output.write(str(soup))

#     print(f"HTML files successfully combined into {output_file}")

# # Example usage:
# input_folder = 'Recipes/'
# output_file = 'output_images.html'
# image_output_folder = 'images/'
# combine_html_files(input_folder, output_file, image_output_folder)



import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

from urllib.parse import urlparse

def download_image(img_url, image_folder):
    # Check if img_url is a valid URL
    parsed_url = urlparse(img_url)
    if not parsed_url.scheme or not parsed_url.netloc:
        print(f"Error: Invalid URL - {img_url}. Skipping download.")
        return None

    # Create the local image path
    image_name = os.path.basename(parsed_url.path)
    local_image_path = os.path.join(image_folder, image_name)

    # Create the necessary directories if they don't exist
    os.makedirs(os.path.dirname(local_image_path), exist_ok=True)

    try:
        # Download the image and save it locally
        response = requests.get(img_url)
        response.raise_for_status()  # Check for HTTP errors

        # Check if local_image_path is a directory
        if os.path.isdir(local_image_path):
            print(f"Error: {local_image_path} is a directory.")
            return None

        with open(local_image_path, 'wb') as img_file:
            img_file.write(response.content)

        return local_image_path

    except requests.exceptions.ConnectionError as e:
        print(f"Error: Unable to connect to {img_url}. Skipping download.")
        return None

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e.response.status_code} - {e.response.text}")
        return None



def combine_html_files(input_folder, output_file, image_folder):
    # Get a list of all HTML files in the input folder
    html_files = [f for f in os.listdir(input_folder) if f.endswith(".html")]

    # Check if there are any HTML files
    if not html_files:
        print("No HTML files found in the specified folder.")
        return

    # Open the output file in write mode
    with open(output_file, 'w') as output:
        # Iterate through each HTML file
        for html_file in html_files:
            # Add a page break between HTML files
            output.write(f'<div style="page-break-before: always;"></div>')

            # Read the content of the current HTML file
            with open(os.path.join(input_folder, html_file), 'r') as input_file:
                file_content = input_file.read()

                # Parse the HTML content to find image URLs within <a> tags with href attributes
                soup = BeautifulSoup(file_content, 'html.parser')
                a_tags = soup.find_all('a', href=True)

                # Replace image URLs with local image paths
                for a_tag in a_tags:
                    img_url = a_tag['href']

                    # Check if the image URL is not already a local path
                    if not img_url.startswith(image_folder):
                        # Download the image and get the local path
                        local_image_path = download_image(img_url, image_folder)

                        # Replace the href attribute with the local image path
                        a_tag['href'] = local_image_path

                # Append the modified content to the output file
                output.write(str(soup))

    print(f"HTML files successfully combined into {output_file}")

# Example usage:
input_folder = 'Recipes/'
output_file = 'output_images.html'
image_folder = 'images/'
combine_html_files(input_folder, output_file, image_folder)
