echo "This script is for dockerhub container build"
echo "Removing the image youtube-feeds:latest..."
docker rmi `docker images|grep youtube-feeds|grep latest|awk '{print $3}'`
echo "Tagging the latest image as youtube-feeds:latest"
docker tag $(docker build -q .|awk -F: '{print $2}') songlining/youtube-feeds:latest
echo "Pushing youtube-feeds:latest to dockerhub"
docker push songlining/youtube-feeds:latest
cd k8s
echo "Reload the image in K8S"
./reset-all.sh
